/**
 * 禁言记录（ban_records.json）
 *
 * 结构沿用旧版，并新增一个可选字段：
 *   { "群号": { "QQ号": { "duration": 180, "ban_time": 1699999999, "left": true } } }
 *
 * - 由禁言/解禁通知（group_ban）写入与清除，任何群都记录（不受功能开关限制）
 * - `left` 由退群/被踢通知（group_decrease）置为 true，禁言开始时置为 false；
 *   老数据没有该字段，表示「无法判断」
 * - 新人禁言用它判断「退群前是否处于禁言状态」，从而实现退群重进重禁
 */

import { readJson, writeJson } from './store';

const DATA_FILE = 'ban_records.json';

export interface BanRecord {
    /** 禁言时长（秒） */
    duration: number;
    /** 禁言开始时间戳（秒） */
    ban_time: number;
    /**
     * 是否已退群：
     *   false    = 仍在群里
     *   true     = 已退群（被踢也算），重新入群时按原时长重禁
     *   undefined= 老数据 / 没收到退群通知，无法判断
     */
    left?: boolean;
    /**
     * 禁言时的昵称（优先群名片）。
     *
     * 通知事件只带 QQ 号，这里是异步反查后补写的；拿不到（接口失败 / 已退群）
     * 就没有该字段，WebUI 会退化成只显示号码。
     */
    user_name?: string;
    /**
     * 是否参与「退群重进重新禁言」。
     *
     * 缺省（含老数据）= 参与；`false` 表示这条禁言不该被重禁
     * —— 目前只有 sm / smplus 这类娱乐向禁言会标成 false。
     */
    remute?: boolean;
}

export type BanRecords = Record<string, Record<string, BanRecord>>;

export function loadBanRecords(): BanRecords {
    const data = readJson<BanRecords>(DATA_FILE, {});
    return data && typeof data === 'object' ? data : {};
}

export function saveBanRecords(records: BanRecords): void {
    writeJson(DATA_FILE, records);
}

/** 记录是否仍在有效期内 */
function isPending(record: BanRecord, now: number): boolean {
    const elapsed = now - Number(record.ban_time ?? 0);
    return elapsed < Number(record.duration ?? 0);
}

export function addBanRecord(
    groupId: number | string,
    userId: number | string,
    duration: number,
    options: { remute?: boolean } = {},
): void {
    const records = loadBanRecords();
    const groupKey = String(groupId);
    const userKey = String(userId);
    if (!records[groupKey]) records[groupKey] = {};
    // 重新禁言说明人在群里，退群标记一并复位
    records[groupKey][userKey] = {
        duration,
        ban_time: Math.floor(Date.now() / 1000),
        left: false,
        // 只有明确不参与时才写这个字段，老数据 / 默认都当作参与
        ...(options.remute === false ? { remute: false } : {}),
    };
    saveBanRecords(records);
}

/* ---------------- 不参与重禁的禁言（sm / smplus） ----------------
 *
 * group_ban 通知里看不出这条禁言是谁发起的（operator 永远是执行动作的 bot），
 * 所以由发起方先打一个「待消费」标记，禁言通知写记录时再取用。
 *
 * 标记按「群 + 人」入队，并带上**发起时用的时长**：同一人在短时间内被不同方式
 * 禁言时，只有时长对得上的那条通知才会消费它，避免互相抢占（随机时长撞车的
 * 概率是 1/时长范围，可以忽略）。没被消费的标记会按 TTL 过期清掉。
 */

/** 标记有效期（毫秒）：禁言通知通常 1 秒内就到 */
const NO_REMUTE_TTL = 10 * 1000;

interface NoRemuteMark {
    /** 发起时使用的禁言时长（秒），用于和通知里的 duration 对上 */
    duration: number;
    at: number;
}

const noRemutePending = new Map<string, NoRemuteMark[]>();

const pendingKey = (groupId: number | string, userId: number | string): string =>
    `${groupId}_${userId}`;

/** 取该键未过期的标记队列（顺带清掉过期的） */
function liveMarks(key: string): NoRemuteMark[] {
    const list = (noRemutePending.get(key) ?? []).filter(
        (mark) => Date.now() - mark.at <= NO_REMUTE_TTL,
    );
    if (list.length) noRemutePending.set(key, list);
    else noRemutePending.delete(key);
    return list;
}

function storeMarks(key: string, list: NoRemuteMark[]): void {
    if (list.length) noRemutePending.set(key, list);
    else noRemutePending.delete(key);
}

/** 标记接下来的这条禁言不参与退群重进重禁 */
export function markNoRemuteBan(
    groupId: number | string,
    userId: number | string,
    duration: number,
): void {
    const key = pendingKey(groupId, userId);
    const list = liveMarks(key);
    list.push({ duration: Math.floor(Number(duration)) || 0, at: Date.now() });
    storeMarks(key, list);
}

/** 撤销最近一次标记（禁言接口直接失败时） */
export function clearNoRemuteBan(groupId: number | string, userId: number | string): void {
    const key = pendingKey(groupId, userId);
    const list = liveMarks(key);
    list.pop();
    storeMarks(key, list);
}

/** 取用并清掉一条「时长对得上」的标记；没有匹配的就不消费 */
export function consumeNoRemuteBan(
    groupId: number | string,
    userId: number | string,
    duration: number,
): boolean {
    const key = pendingKey(groupId, userId);
    const list = liveMarks(key);
    const seconds = Math.floor(Number(duration)) || 0;
    const index = list.findIndex((mark) => mark.duration === seconds);
    if (index < 0) return false;

    list.splice(index, 1);
    storeMarks(key, list);
    return true;
}

export function removeBanRecord(groupId: number | string, userId: number | string): void {
    const records = loadBanRecords();
    const groupKey = String(groupId);
    const userKey = String(userId);
    if (!records[groupKey]?.[userKey]) return;
    delete records[groupKey][userKey];
    if (!Object.keys(records[groupKey]).length) delete records[groupKey];
    saveBanRecords(records);
}

/**
 * 补写昵称。
 *
 * 昵称是异步反查的（见 core/nicknames.ts），记录本身要先落盘，
 * 所以这里只是把查到的名字补回去；记录已经不存在（比如已解禁）时静默跳过。
 */
export function setBanRecordName(
    groupId: number | string,
    userId: number | string,
    userName: string,
): void {
    const name = userName.trim();
    if (!name) return;

    try {
        const records = loadBanRecords();
        const record = records[String(groupId)]?.[String(userId)];
        if (!record || record.user_name === name) return;
        record.user_name = name;
        saveBanRecords(records);
    } catch {
        /* 补写昵称失败不影响禁言记录本身 */
    }
}

/** 标记 / 取消「已退群」；返回是否真的改动了 */
export function setBanRecordLeft(
    groupId: number | string,
    userId: number | string,
    left: boolean,
): boolean {
    const records = loadBanRecords();
    const groupKey = String(groupId);
    const userKey = String(userId);
    const record = records[groupKey]?.[userKey];
    if (!record || record.left === left) return false;

    record.left = left;
    saveBanRecords(records);
    return true;
}

/**
 * 查找该用户「重新入群后应当被重新禁言」的记录，返回命中记录及其所在群。
 *
 * 规则：
 *   1. 同一个群里未过期的记录直接命中 —— 能在这个群里入群，只可能是退群后回来；
 *   2. 同一条配置组下的**其它群**也可以命中（配置组内互通，防止换群逃避禁言），
 *      但要求记录已被标记为「已退群」，避免「首次加入同配置的另一个群」被误重禁。
 *
 * 顺带清理过期的记录。
 */
export function findPendingBan(
    joinGroupId: number | string,
    scopeGroupIds: Array<number | string>,
    userId: number | string,
): { groupId: string; record: BanRecord } | null {
    const records = loadBanRecords();
    const joinKey = String(joinGroupId);
    const userKey = String(userId);
    const now = Math.floor(Date.now() / 1000);
    let changed = false;
    let hit: { groupId: string; record: BanRecord } | null = null;

    const drop = (groupKey: string): void => {
        delete records[groupKey][userKey];
        if (!Object.keys(records[groupKey]).length) delete records[groupKey];
        changed = true;
    };

    // 1) 同群：只看到期与否
    const same = records[joinKey]?.[userKey];
    if (same) {
        if (!isPending(same, now)) drop(joinKey);
        // sm / smplus 这类禁言不参与重禁，但仍然保留在记录里（界面要能看到）
        else if (same.remute !== false) hit = { groupId: joinKey, record: same };
    }

    // 2) 同配置组的其它群：需要确认已退群
    if (!hit) {
        for (const id of scopeGroupIds) {
            const groupKey = String(id);
            if (groupKey === joinKey) continue;
            const record = records[groupKey]?.[userKey];
            if (!record) continue;
            if (!isPending(record, now)) {
                drop(groupKey);
                continue;
            }
            if (record.left !== true || record.remute === false) continue;
            hit = { groupId: groupKey, record };
            break;
        }
    }

    if (changed) saveBanRecords(records);
    return hit;
}

/** 清理已过期的记录 */
export function cleanExpiredBanRecords(): void {
    const records = loadBanRecords();
    const now = Math.floor(Date.now() / 1000);
    let changed = false;

    for (const groupKey of Object.keys(records)) {
        for (const userKey of Object.keys(records[groupKey])) {
            const record = records[groupKey][userKey];
            if (now - Number(record.ban_time ?? 0) >= Number(record.duration ?? 0)) {
                delete records[groupKey][userKey];
                changed = true;
            }
        }
        if (!Object.keys(records[groupKey]).length) {
            delete records[groupKey];
            changed = true;
        }
    }

    if (changed) saveBanRecords(records);
}

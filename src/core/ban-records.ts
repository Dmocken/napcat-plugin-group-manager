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

export function addBanRecord(groupId: number | string, userId: number | string, duration: number): void {
    const records = loadBanRecords();
    const groupKey = String(groupId);
    const userKey = String(userId);
    if (!records[groupKey]) records[groupKey] = {};
    // 重新禁言说明人在群里，退群标记一并复位
    records[groupKey][userKey] = { duration, ban_time: Math.floor(Date.now() / 1000), left: false };
    saveBanRecords(records);
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
        if (isPending(same, now)) hit = { groupId: joinKey, record: same };
        else drop(joinKey);
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
            if (record.left !== true) continue;
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

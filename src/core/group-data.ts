/**
 * 群数据：黑历史 / 撤回记录 / 禁言记录的集中读写
 *
 * 供 WebUI 的「群数据」页做增删改查，文件格式与旧版 / 各 handler 完全一致：
 *   data/black_history.json   [ { id, user_id, content: [{ type, data }] } ]
 *   data/recall_records.json  { "群号": { "QQ号": { count, records: [...] } } }
 *   data/ban_records.json     { "群号": { "QQ号": { duration, ban_time } } }
 *
 * 上面两种结构（黑历史 / 撤回记录）在本模块内统一了类型定义与读写，
 * handler 与接口层共用，避免同一份文件出现两套解析逻辑。
 */

import {
    cleanExpiredBanRecords,
    loadBanRecords,
    removeBanRecord,
    saveBanRecords,
    type BanRecord,
} from './ban-records';
import { readJson, writeJson } from './store';

/** QQ 群禁言时长上限：30 天（前端的选择器也按这个上限来） */
export const MAX_BAN_SECONDS = 30 * 24 * 3600;

/* ---------------- 黑历史 ---------------- */

export interface BlackContent {
    type: string;
    data: string;
}

export interface BlackRecord {
    id: number;
    user_id: number;
    /** 记入时所在的群号；老数据没有这个字段（WebUI 里归入「未记录群」） */
    group_id?: number;
    content: BlackContent[];
}

const BLACK_FILE = 'black_history.json';

export function loadBlackHistory(): BlackRecord[] {
    const data = readJson<BlackRecord[]>(BLACK_FILE, []);
    return Array.isArray(data) ? data : [];
}

export function saveBlackHistory(list: BlackRecord[]): void {
    writeJson(BLACK_FILE, list);
}

/** 记录正文：入典只记录纯文字消息，拼接所有文字段即可 */
export function blackRecordText(record: BlackRecord): string {
    return (record.content ?? [])
        .filter((seg) => seg && typeof seg.data === 'string')
        .map((seg) => seg.data)
        .join('');
}

/** 下一条可用编号 */
export function nextBlackId(list: BlackRecord[]): number {
    return list.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
}

/* ---------------- 撤回记录 ---------------- */

export interface RecallEntry {
    operator_id: number;
    operator_name: string;
    message: string;
    timestamp: number;
}

export interface RecallUserData {
    count: number;
    records: RecallEntry[];
    /** 被撤回人的昵称（记录时反查）；老数据没有，前端会退回好友列表 / 只显示号码 */
    name?: string;
}

/** 群号 → QQ 号 → 该用户被撤回的数据 */
export type RecallData = Record<string, Record<string, RecallUserData>>;

const RECALL_FILE = 'recall_records.json';

export function loadRecallRecords(): RecallData {
    const data = readJson<RecallData>(RECALL_FILE, {});
    return data && typeof data === 'object' ? data : {};
}

export function saveRecallRecords(data: RecallData): void {
    writeJson(RECALL_FILE, data);
}

function countRecallUsers(data: RecallData): number {
    return Object.values(data).reduce((sum, users) => sum + Object.keys(users).length, 0);
}

/* ---------------- 面向 WebUI 的扁平化视图 ---------------- */

/** 黑历史列表项（正文已拼成纯文本） */
export interface BlackRecordRow {
    id: number;
    userId: number;
    /** 所属群号；空字符串表示老数据没有记录群 */
    groupId: string;
    text: string;
}

export function listBlackRecordRows(): BlackRecordRow[] {
    return loadBlackHistory()
        .map((record) => ({
            id: Number(record.id) || 0,
            userId: Number(record.user_id) || 0,
            groupId: Number(record.group_id) > 0 ? String(record.group_id) : '',
            text: blackRecordText(record),
        }))
        .sort((a, b) => a.id - b.id);
}

/** 撤回记录列表项（一条 = 某群某人） */
export interface RecallRow {
    groupId: string;
    userId: string;
    /** 被撤回人的昵称；老数据为空 */
    userName?: string;
    count: number;
    /** 最近一次被撤回的时间戳（秒） */
    lastAt: number;
    records: {
        operatorId: number;
        operatorName: string;
        message: string;
        timestamp: number;
    }[];
}

export function listRecallRows(): RecallRow[] {
    const data = loadRecallRecords();
    const rows: RecallRow[] = [];

    for (const groupId of Object.keys(data)) {
        for (const userId of Object.keys(data[groupId])) {
            const userData = data[groupId][userId];
            const records = (userData?.records ?? []).map((item) => ({
                operatorId: Number(item.operator_id) || 0,
                operatorName: String(item.operator_name ?? ''),
                message: String(item.message ?? ''),
                timestamp: Number(item.timestamp) || 0,
            }));
            const userName =
                typeof userData?.name === 'string' ? userData.name.trim() : '';
            rows.push({
                groupId,
                userId,
                ...(userName ? { userName } : {}),
                count: records.length,
                lastAt: records.reduce((max, item) => Math.max(max, item.timestamp), 0),
                records,
            });
        }
    }

    return rows.sort(
        (a, b) => b.lastAt - a.lastAt || a.groupId.localeCompare(b.groupId),
    );
}

/** 禁言记录列表项 */
export interface BanRecordRow {
    groupId: string;
    userId: string;
    /** 保留的禁言时长（秒） */
    duration: number;
    /** 禁言开始时间戳（秒） */
    banTime: number;
    /** 剩余保留时长（秒） */
    remaining: number;
    /** 是否已退群；undefined = 无法判断（老数据 / 没收到退群通知） */
    left?: boolean;
    /** 禁言时反查到的昵称；没有（老数据 / 反查失败）时为空 */
    userName?: string;
    /** false = 这条禁言不参与「退群重进重新禁言」（sm / smplus） */
    remute?: boolean;
}

/** 扁平化禁言记录（顺带清理已过期项） */
export function listBanRecords(): BanRecordRow[] {
    cleanExpiredBanRecords();

    const now = Math.floor(Date.now() / 1000);
    const records = loadBanRecords();
    const rows: BanRecordRow[] = [];

    for (const groupId of Object.keys(records)) {
        for (const userId of Object.keys(records[groupId])) {
            const record = records[groupId][userId];
            const duration = Math.max(0, Number(record?.duration) || 0);
            const banTime = Number(record?.ban_time) || 0;
            const elapsed = Math.max(0, now - banTime);
            const left = typeof record?.left === 'boolean' ? record.left : undefined;
            const userName =
                typeof record?.user_name === 'string' ? record.user_name.trim() : '';
            rows.push({
                groupId,
                userId,
                duration,
                banTime,
                remaining: Math.max(0, duration - elapsed),
                ...(left === undefined ? {} : { left }),
                ...(userName ? { userName } : {}),
                ...(record?.remute === false ? { remute: false } : {}),
            });
        }
    }

    return rows.sort(
        (a, b) => a.groupId.localeCompare(b.groupId) || a.userId.localeCompare(b.userId),
    );
}

/* ---------------- 写操作 ---------------- */

export type OpResult = { ok: true; message?: string } | { ok: false; message: string };

/** 新增黑历史；返回新编号 */
export function addBlackRecord(
    userId: number | string,
    text: string,
    groupId?: number | string,
): number {
    const list = loadBlackHistory();
    const id = nextBlackId(list);
    const gid = Number(groupId);
    list.push({
        id,
        user_id: Number(userId) || 0,
        ...(Number.isFinite(gid) && gid > 0 ? { group_id: gid } : {}),
        content: [{ type: 'text', data: text }],
    });
    saveBlackHistory(list);
    return id;
}

/** 修改黑历史（用户 QQ / 正文 / 所属群，传哪个改哪个） */
export function updateBlackRecord(
    id: number | string,
    patch: { userId?: number | string; text?: string; groupId?: number | string },
): boolean {
    const list = loadBlackHistory();
    const record = list.find((item) => Number(item.id) === Number(id));
    if (!record) return false;

    if (patch.userId !== undefined) record.user_id = Number(patch.userId) || 0;
    if (patch.text !== undefined) record.content = [{ type: 'text', data: patch.text }];
    if (patch.groupId !== undefined) {
        const gid = Number(patch.groupId);
        if (Number.isFinite(gid) && gid > 0) record.group_id = gid;
        else delete record.group_id;
    }

    saveBlackHistory(list);
    return true;
}

/** 按编号批量删除黑历史；返回删除条数 */
export function removeBlackRecords(ids: Array<number | string>): number {
    const wanted = new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id)));
    if (!wanted.size) return 0;

    const list = loadBlackHistory();
    const kept = list.filter((item) => !wanted.has(Number(item.id)));
    const removed = list.length - kept.length;
    if (removed) saveBlackHistory(kept);
    return removed;
}

/** 清空黑历史；返回删除条数 */
export function clearBlackHistory(): number {
    const count = loadBlackHistory().length;
    saveBlackHistory([]);
    return count;
}

/** 删除某群某人的撤回记录 */
export function removeRecallUser(groupId: number | string, userId: number | string): boolean {
    const data = loadRecallRecords();
    const groupKey = String(groupId);
    const userKey = String(userId);
    if (!data[groupKey]?.[userKey]) return false;

    delete data[groupKey][userKey];
    if (!Object.keys(data[groupKey]).length) delete data[groupKey];
    saveRecallRecords(data);
    return true;
}

/** 清空撤回记录：传群号只清该群，否则全清；返回删除的「用户记录」条数 */
export function clearRecallRecords(groupId?: number | string): number {
    const data = loadRecallRecords();

    if (groupId === undefined || groupId === '') {
        const count = countRecallUsers(data);
        saveRecallRecords({});
        return count;
    }

    const groupKey = String(groupId);
    if (!data[groupKey]) return 0;

    const count = Object.keys(data[groupKey]).length;
    delete data[groupKey];
    saveRecallRecords(data);
    return count;
}

/**
 * 修改保留的禁言时长。
 *
 * 开始时间不变，只改总时长，因此新时长必须大于「已经过去的时间」，
 * 否则这条记录会立刻被判定为过期（`getPendingBan` 会把它清掉）。
 *
 * 昵称 / 是否退群 / 是否参与重禁这些字段原样保留，不能在改时长时被抹掉。
 */
export function updateBanDuration(
    groupId: number | string,
    userId: number | string,
    duration: number,
): OpResult {
    const seconds = Math.floor(Number(duration));
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return { ok: false, message: '时长必须是大于 0 的秒数' };
    }
    if (seconds > MAX_BAN_SECONDS) {
        return { ok: false, message: `时长不能超过 30 天（${MAX_BAN_SECONDS} 秒）` };
    }

    const records = loadBanRecords();
    const groupKey = String(groupId);
    const userKey = String(userId);
    const record = records[groupKey]?.[userKey];
    if (!record) {
        return { ok: false, message: '这条禁言记录已经不在了（可能已过期），刷新后再试' };
    }

    // sm / smplus 的禁言压根不参与重禁，保留时长没有意义
    if (record.remute === false) {
        return {
            ok: false,
            message: '这条禁言来自 sm / smplus，不参与退群重进重禁，不需要改时长',
        };
    }

    const banTime = Number(record.ban_time) || Math.floor(Date.now() / 1000);
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - banTime);
    if (seconds <= elapsed) {
        return {
            ok: false,
            message: `这条记录已经过去 ${elapsed} 秒，时长必须大于它，否则会立刻过期`,
        };
    }

    // 只覆盖时长：以前这里重建了一个新对象，会把 user_name（昵称）和 left（是否退群）
    // 一起抹掉 —— 页面上的名字随即消失，「退群重进重禁」的跨群命中也会失效
    records[groupKey][userKey] = { ...record, duration: seconds, ban_time: banTime };
    saveBanRecords(records);
    return { ok: true };
}

/** 删除单条禁言记录 */
export function removeBanRow(groupId: number | string, userId: number | string): boolean {
    const records = loadBanRecords();
    if (!records[String(groupId)]?.[String(userId)]) return false;
    removeBanRecord(groupId, userId);
    return true;
}

/** 把一条禁言记录迁移到另一个群（用于收拾「未绑定配置」里的数据） */
export function migrateBanRecord(
    groupId: number | string,
    userId: number | string,
    targetGroupId: number | string,
): OpResult {
    const from = String(groupId);
    const to = String(targetGroupId);
    const userKey = String(userId);

    if (!to) return { ok: false, message: '请选择要迁移到的群' };
    if (to === from) return { ok: false, message: '目标群和当前群是同一个' };

    const records = loadBanRecords();
    const record = records[from]?.[userKey];
    if (!record) return { ok: false, message: '这条记录已经不在了（可能已过期），刷新后再试' };
    if (records[to]?.[userKey]) {
        return { ok: false, message: '目标群里已经有这个人的禁言记录了，请先删掉其中一条' };
    }

    // 「是否退群」记的是原来那个群的退群状态，搬到新群后已经无从判断，复位成未知
    const moved: BanRecord = { ...record };
    delete moved.left;

    if (!records[to]) records[to] = {};
    records[to][userKey] = moved;
    delete records[from][userKey];
    if (!Object.keys(records[from]).length) delete records[from];
    saveBanRecords(records);
    return { ok: true };
}

/** 把某人的撤回记录迁移到另一个群 */
export function migrateRecallUser(
    groupId: number | string,
    userId: number | string,
    targetGroupId: number | string,
): OpResult {
    const from = String(groupId);
    const to = String(targetGroupId);
    const userKey = String(userId);

    if (!to) return { ok: false, message: '请选择要迁移到的群' };
    if (to === from) return { ok: false, message: '目标群和当前群是同一个' };

    const data = loadRecallRecords();
    const userData = data[from]?.[userKey];
    if (!userData) return { ok: false, message: '这条记录已经不存在了，刷新后再试' };
    if (data[to]?.[userKey]) {
        return { ok: false, message: '目标群里已经有这个人的撤回记录了，请先删掉其中一条' };
    }

    if (!data[to]) data[to] = {};
    data[to][userKey] = userData;
    delete data[from][userKey];
    if (!Object.keys(data[from]).length) delete data[from];
    saveRecallRecords(data);
    return { ok: true };
}

/** 清空禁言记录：传群号只清该群，否则全清；返回删除条数 */
export function clearBanRecords(groupId?: number | string): number {
    const records = loadBanRecords();

    if (groupId === undefined || groupId === '') {
        const count = Object.values(records).reduce(
            (sum, users) => sum + Object.keys(users).length,
            0,
        );
        saveBanRecords({});
        return count;
    }

    const groupKey = String(groupId);
    if (!records[groupKey]) return 0;

    const count = Object.keys(records[groupKey]).length;
    delete records[groupKey];
    saveBanRecords(records);
    return count;
}

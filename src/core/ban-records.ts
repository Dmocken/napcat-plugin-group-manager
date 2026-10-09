/**
 * 禁言记录（ban_records.json）
 *
 * 结构沿用旧版：
 *   { "群号": { "QQ号": { "duration": 180, "ban_time": 1699999999 } } }
 *
 * - 由禁言/解禁通知（group_ban）写入与清除，任何群都记录（不受功能开关限制）
 * - 新人禁言用它判断「退群前是否处于禁言状态」，从而实现退群重进重禁
 */

import { readJson, writeJson } from './store';

const DATA_FILE = 'ban_records.json';

export interface BanRecord {
    /** 禁言时长（秒） */
    duration: number;
    /** 禁言开始时间戳（秒） */
    ban_time: number;
}

export type BanRecords = Record<string, Record<string, BanRecord>>;

export function loadBanRecords(): BanRecords {
    const data = readJson<BanRecords>(DATA_FILE, {});
    return data && typeof data === 'object' ? data : {};
}

export function saveBanRecords(records: BanRecords): void {
    writeJson(DATA_FILE, records);
}

export function addBanRecord(groupId: number | string, userId: number | string, duration: number): void {
    const records = loadBanRecords();
    const groupKey = String(groupId);
    const userKey = String(userId);
    if (!records[groupKey]) records[groupKey] = {};
    records[groupKey][userKey] = { duration, ban_time: Math.floor(Date.now() / 1000) };
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

/** 查询未过期的禁言记录（过期会顺手清理） */
export function getPendingBan(groupId: number | string, userId: number | string): BanRecord | null {
    const records = loadBanRecords();
    const groupKey = String(groupId);
    const userKey = String(userId);
    const record = records[groupKey]?.[userKey];
    if (!record) return null;

    const elapsed = Math.floor(Date.now() / 1000) - Number(record.ban_time ?? 0);
    if (elapsed < Number(record.duration ?? 0)) return record;

    delete records[groupKey][userKey];
    if (!Object.keys(records[groupKey]).length) delete records[groupKey];
    saveBanRecords(records);
    return null;
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

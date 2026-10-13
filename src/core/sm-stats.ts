/**
 * sm / smplus 禁言时长统计（data/sm_stats.json）
 *
 * 文件结构：
 *   { "QQ号": { "count": 3, "total": 5400, "longest": 3600, "longest_at": 1699999999,
 *               "name": "群名片（禁言时反查，拿不到就没有）" } }
 *
 * - 只按 QQ 号聚合，**跨群**累计：不记录群号、配置组，纯粹「谁被禁得最惨」
 * - 昵称只是顺手留一份，方便看板 / sm list 显示（拿不到就退回好友列表 / 只显示号码）
 * - 数据来源是 group_ban 通知，且只统计 sm / smplus 发起的禁言
 *   （这两类禁言不参与「退群重进重禁」，由 core/ban-records.ts 的标记识别）
 * 两处排序口径：
 *   - 群内 `sm list` / `smplus list`（topSmMuted）：看「最长一次」（谁被随机禁得最狠）
 *   - 后台看板（listSmStats）：看「累计时长」（谁被禁得最多）
 */

import { readJson, writeJson } from './store';

const DATA_FILE = 'sm_stats.json';

/** 单个用户被 sm / smplus 禁言的累计情况 */
export interface SmStatRow {
    userId: string;
    /** 被禁言次数 */
    count: number;
    /** 累计被禁言秒数 */
    total: number;
    /** 最长一次的禁言秒数 */
    longest: number;
    /** 最长那一次的时间戳（秒） */
    longestAt: number;
    /** 最近一次禁言时反查到的群名片；没有时为空 */
    name?: string;
}

interface SmStatRecord {
    count: number;
    total: number;
    longest: number;
    longest_at: number;
    /** 最近一次反查到的群名片 */
    name?: string;
}

type SmStats = Record<string, SmStatRecord>;

function loadSmStats(): SmStats {
    const data = readJson<SmStats>(DATA_FILE, {});
    return data && typeof data === 'object' ? data : {};
}

/** 记一次 sm / smplus 禁言（禁言生效后由 group_ban 通知调用） */
export function recordSmMute(userId: number | string, seconds: number): void {
    const uid = String(userId).trim();
    const secs = Math.max(0, Math.floor(Number(seconds) || 0));
    if (!uid || secs <= 0) return;

    try {
        const data = loadSmStats();
        const record: SmStatRecord = data[uid] ?? {
            count: 0,
            total: 0,
            longest: 0,
            longest_at: 0,
        };

        record.count += 1;
        record.total += secs;
        if (secs > record.longest) {
            record.longest = secs;
            record.longest_at = Math.floor(Date.now() / 1000);
        }

        data[uid] = record;
        writeJson(DATA_FILE, data);
    } catch {
        /* 统计失败不影响禁言本身 */
    }
}

/**
 * 补写昵称（禁言通知里只有 QQ 号，名字是异步反查的，查到再补）。
 *
 * 记录不存在（统计没开 / 已被删）时静默跳过；昵称留最近一次的即可。
 */
export function setSmStatName(userId: number | string, name: string): void {
    const uid = String(userId).trim();
    const value = name.trim();
    if (!uid || !value) return;

    try {
        const data = loadSmStats();
        const record = data[uid];
        if (!record || record.name === value) return;
        record.name = value;
        writeJson(DATA_FILE, data);
    } catch {
        /* 补写昵称失败不影响统计本身 */
    }
}

/** 读盘并规范成列表（过滤掉没有有效记录的条目） */
function allRows(): SmStatRow[] {
    return Object.entries(loadSmStats())
        .map(([userId, record]) => {
            const name = typeof record?.name === 'string' ? record.name.trim() : '';
            return {
                userId,
                count: Math.max(0, Math.floor(Number(record?.count) || 0)),
                total: Math.max(0, Math.floor(Number(record?.total) || 0)),
                longest: Math.max(0, Math.floor(Number(record?.longest) || 0)),
                longestAt: Math.max(0, Math.floor(Number(record?.longest_at) || 0)),
                ...(name ? { name } : {}),
            };
        })
        .filter((row) => row.longest > 0);
}

/**
 * 后台看板用：全部记录，按**累计时长**降序（并列时比最长一次）。
 *
 * 与群内 `sm list` 的口径不同：那边看「最长一次」（谁被随机禁得最狠），
 * 后台看的是「累计被禁了多久」。
 */
export function listSmStats(): SmStatRow[] {
    return allRows().sort(
        (a, b) => b.total - a.total || b.longest - a.longest || a.userId.localeCompare(b.userId),
    );
}

/** 删除某个用户的统计；返回是否真的删掉了 */
export function removeSmStat(userId: number | string): boolean {
    const uid = String(userId).trim();
    if (!uid) return false;

    const data = loadSmStats();
    if (!data[uid]) return false;

    delete data[uid];
    writeJson(DATA_FILE, data);
    return true;
}

/** 被禁言时长最长的前 limit 名（最长一次降序，并列时按累计时长；群内 sm list 用） */
export function topSmMuted(limit: number): SmStatRow[] {
    const max = Math.max(1, Math.floor(limit) || 1);

    return allRows()
        .sort(
            (a, b) =>
                b.longest - a.longest || b.total - a.total || a.userId.localeCompare(b.userId),
        )
        .slice(0, max);
}

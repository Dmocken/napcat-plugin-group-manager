/**
 * sm / smplus 禁言时长统计（data/sm_stats.json）
 *
 * 文件结构：
 *   { "QQ号": { "count": 3, "total": 5400, "longest": 3600, "longest_at": 1699999999 } }
 *
 * - 只按 QQ 号聚合，**跨群**累计：不记录群号、配置组，纯粹「谁被禁得最惨」
 * - 数据来源是 group_ban 通知，且只统计 sm / smplus 发起的禁言
 *   （这两类禁言不参与「退群重进重禁」，由 core/ban-records.ts 的标记识别）
 * - 排行榜主看「最长一次的禁言时长」（并列时按累计时长），
 *   同时也存了累计时长与次数，供文案自定义取用
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
}

interface SmStatRecord {
    count: number;
    total: number;
    longest: number;
    longest_at: number;
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

/** 被禁言时长最长的前 limit 名（最长一次降序，并列时按累计时长） */
export function topSmMuted(limit: number): SmStatRow[] {
    const max = Math.max(1, Math.floor(limit) || 1);

    return Object.entries(loadSmStats())
        .map(([userId, record]) => ({
            userId,
            count: Math.max(0, Math.floor(Number(record?.count) || 0)),
            total: Math.max(0, Math.floor(Number(record?.total) || 0)),
            longest: Math.max(0, Math.floor(Number(record?.longest) || 0)),
            longestAt: Math.max(0, Math.floor(Number(record?.longest_at) || 0)),
        }))
        .filter((row) => row.longest > 0)
        .sort(
            (a, b) =>
                b.longest - a.longest || b.total - a.total || a.userId.localeCompare(b.userId),
        )
        .slice(0, max);
}

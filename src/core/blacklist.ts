/**
 * 拉黑名单（data/blacklist.json）
 *
 * 文件结构（按**配置组**分层）：
 *   { "profile-1": { "123456": { "at": 1699999999, "by": 654321,
 *                                 "name": "群名片（拉黑时反查，拿不到就没有）",
 *                                 "reason": "可选的原因" } } }
 *
 * - 粒度是配置组而不是单个群：一条 profile 绑定多个群（见 core/profiles.ts），
 *   在组里任何一群拉黑，组内所有群的入群申请都拦 —— 与「配置组」的语义一致
 * - 只拦入群申请（request/group 的 add 与 invite），不踢已在群内的成员
 * - 名单本身可以在 WebUI「群数据 → 拉黑名单」查看 / 删除；
 *   入群拦截是否生效还要看该群是否开启了「拉黑」功能（与其它功能一致）
 */

import { findProfileByGroup } from './profiles';
import { readJson, writeJson } from './store';

const DATA_FILE = 'blacklist.json';

/** 一条拉黑记录 */
export interface BlacklistEntry {
    /** 拉黑时间戳（秒） */
    at: number;
    /** 执行拉黑的人（Bot 管理员 / 群管理） */
    by: number;
    /** 拉黑时反查到的昵称；没有则为空 */
    name?: string;
    /** 可选的原因，会显示在 WebUI 与拦截理由里 */
    reason?: string;
}

/** 配置组 id → QQ 号 → 拉黑记录 */
export type BlacklistData = Record<string, Record<string, BlacklistEntry>>;

/** WebUI 列表用的一行 */
export interface BlacklistRow {
    /** 所属配置组 id（WebUI 用群配置把 id 换成名称） */
    profileId: string;
    userId: string;
    /** 拉黑时间戳（秒） */
    at: number;
    /** 执行拉黑的人 */
    by: number;
    /** 拉黑时反查到的昵称；没有则为空 */
    name?: string;
    reason?: string;
}

function loadBlacklist(): BlacklistData {
    const data = readJson<BlacklistData>(DATA_FILE, {});
    return data && typeof data === 'object' ? data : {};
}

/** 该群所属配置组的拉黑名单（没有配置组时返回空表） */
export function blacklistOfGroup(groupId: number | string): Record<string, BlacklistEntry> {
    const profile = findProfileByGroup(groupId);
    if (!profile) return {};
    return loadBlacklist()[profile.id] ?? {};
}

/** 某个群号下这个人是否被拉黑（入群申请拦截用） */
export function isBlacklisted(groupId: number | string, userId: number | string): boolean {
    const uid = String(userId).trim();
    if (!uid) return false;
    return Boolean(blacklistOfGroup(groupId)[uid]);
}

export type AddResult = 'added' | 'exists';

/**
 * 把某人加进配置组拉黑名单。
 *
 * @param profileId 配置组 id（由调用方按群号解析，见 findProfileByGroup）
 * @returns 'exists' 表示已在名单里，未做改动
 */
export function addToBlacklist(
    profileId: string,
    userId: number | string,
    by: number | string,
    name?: string,
    reason?: string,
): AddResult {
    const uid = String(userId).trim();
    if (!uid) return 'exists';

    try {
        const data = loadBlacklist();
        const group = data[profileId] ?? {};
        if (group[uid]) return 'exists';

        const entry: BlacklistEntry = {
            at: Math.floor(Date.now() / 1000),
            by: Number(by) || 0,
        };
        const nick = (name ?? '').trim();
        if (nick) entry.name = nick;
        const why = (reason ?? '').trim();
        if (why) entry.reason = why;

        group[uid] = entry;
        data[profileId] = group;
        writeJson(DATA_FILE, data);
        return 'added';
    } catch {
        /* 写盘失败时按「已在名单」处理，调用方不会重复提示 */
        return 'exists';
    }
}

/** 解除拉黑；返回是否真的删掉了 */
export function removeFromBlacklist(profileId: string, userId: number | string): boolean {
    const uid = String(userId).trim();
    if (!uid) return false;

    try {
        const data = loadBlacklist();
        const group = data[profileId];
        if (!group || !group[uid]) return false;

        delete group[uid];
        // 这个配置组已经没人了就把空壳删掉，文件里不留垃圾
        if (!Object.keys(group).length) delete data[profileId];
        writeJson(DATA_FILE, data);
        return true;
    } catch {
        return false;
    }
}

/** 扁平化全部记录，按配置组 → 拉黑时间排序 */
export function listBlacklistRows(): BlacklistRow[] {
    const data = loadBlacklist();
    const rows: BlacklistRow[] = [];

    for (const profileId of Object.keys(data)) {
        for (const userId of Object.keys(data[profileId] ?? {})) {
            const entry = data[profileId][userId];
            const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
            const reason = typeof entry?.reason === 'string' ? entry.reason.trim() : '';
            rows.push({
                profileId,
                userId,
                at: Math.max(0, Math.floor(Number(entry?.at) || 0)),
                by: Math.max(0, Math.floor(Number(entry?.by) || 0)),
                ...(name ? { name } : {}),
                ...(reason ? { reason } : {}),
            });
        }
    }

    return rows.sort(
        (a, b) => a.profileId.localeCompare(b.profileId) || b.at - a.at || a.userId.localeCompare(b.userId),
    );
}

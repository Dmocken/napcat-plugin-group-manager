/**
 * 群主 / 管理员本地记录
 *
 * 「AI 失败通知对象」级联菜单右侧要列出某个群的群主与管理员。原来每次打开
 * 都会调 get_group_member_list 拉全量成员，既慢又浪费（几十上百条只用到几个人）。
 *
 * 这里做一层本地记录（内存 + data/group_managers.json）：
 *   - 第一次查某个群 → 实时拉取并落盘
 *   - 之后直接读本地记录，靠群通知（group_admin / group_decrease）增量更新
 *   - 记录缺失 或 显式 refresh 时才重新实时拉取
 *
 * 记录不过期：群主转让没有标准通知，NapCat 也不会告知，索性不做处理，
 * 数据对不上时由界面上的「刷新」按钮手动重新拉取。
 */

import fs from 'node:fs';

import { callAction } from '../core/messages';
import { getCachedNickname } from '../core/nicknames';
import { logDebug, logWarn } from '../core/state';
import { dataFile } from '../core/store';
import type { RawEventLike } from '../types';

const CACHE_FILE = 'group_managers.json';

export interface ManagerUser {
    userId: string;
    /** 群名片或昵称；靠通知增量更新时可能拿不到，前端会退回显示号码 */
    name?: string;
}

export interface GroupManagers {
    groupId: string;
    /** 群主；取不到时为 null */
    owner: ManagerUser | null;
    /** 管理员们 */
    admins: ManagerUser[];
    /** 本地记录最后更新的时间戳（实时拉取 = 拉取完成时间） */
    updatedAt: number;
    /** true = 本次直接命中本地记录，没有重新拉取 */
    cached: boolean;
    /** 拉取失败的原因（bot 不在群里 / 接口异常）；有值时会尽量回退到本地记录 */
    error?: string;
}

interface CacheEntry {
    owner: ManagerUser | null;
    admins: ManagerUser[];
    updatedAt: number;
}

interface CacheFile {
    groups: Record<string, CacheEntry>;
}

let cache: Record<string, CacheEntry> | null = null;

/** 规范化一条用户记录；号码为空时返回 null */
function normalizeUser(raw: unknown): ManagerUser | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<ManagerUser>;
    const id = String(r.userId ?? '').trim();
    if (!id) return null;
    const name = String(r.name ?? '').trim();
    return { userId: id, ...(name ? { name } : {}) };
}

/** 规范化一个群的记录；结构不合法时返回 null */
function normalizeEntry(raw: unknown): CacheEntry | null {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<CacheEntry>;
    const admins = (Array.isArray(r.admins) ? r.admins : [])
        .map(normalizeUser)
        .filter((u): u is ManagerUser => u !== null);
    return {
        owner: normalizeUser(r.owner),
        admins,
        updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
    };
}

/** 懒加载本地记录文件（只读一次，之后走内存） */
function load(): Record<string, CacheEntry> {
    if (cache) return cache;
    const store: Record<string, CacheEntry> = {};
    try {
        const file = dataFile(CACHE_FILE);
        if (fs.existsSync(file)) {
            const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<CacheFile>;
            const groups = raw?.groups;
            if (groups && typeof groups === 'object') {
                Object.entries(groups).forEach(([gid, entry]) => {
                    const normalized = normalizeEntry(entry);
                    if (gid && normalized) store[String(gid)] = normalized;
                });
            }
        }
    } catch (e) {
        logWarn('[群管助手] 读取群主 / 管理员本地记录失败，按空处理:', e);
    }
    cache = store;
    return cache;
}

function persist(): void {
    try {
        fs.writeFileSync(dataFile(CACHE_FILE), JSON.stringify({ groups: cache ?? {} }), 'utf-8');
    } catch (e) {
        logWarn('[群管助手] 写入群主 / 管理员本地记录失败:', e);
    }
}

/** 实时拉取某个群的群主 / 管理员 */
async function fetchLive(
    groupId: string,
): Promise<{ owner: ManagerUser | null; admins: ManagerUser[] }> {
    const members = await callAction<
        { role?: string; user_id?: number | string; card?: string; nickname?: string }[]
    >('get_group_member_list', { group_id: groupId });

    const list = Array.isArray(members) ? members : [];
    const toUser = (m: (typeof list)[number]): ManagerUser => {
        const name = String(m?.card || m?.nickname || '').trim();
        return { userId: String(m?.user_id ?? '').trim(), ...(name ? { name } : {}) };
    };

    const ownerMember = list.find((m) => String(m?.role ?? '') === 'owner');
    const admins = list
        .filter((m) => String(m?.role ?? '') === 'admin')
        .map(toUser)
        .filter((u) => u.userId);

    return { owner: ownerMember ? toUser(ownerMember) : null, admins };
}

/**
 * 取某个群的群主 / 管理员：优先本地记录，缺失 / refresh=true 时实时拉取。
 *
 * 实时拉取失败时，如果有旧的本地记录会一并返回（cached=true 且带 error），
 * 让界面至少能显示上次的结果并提示更新失败；完全没有记录时只返回 error。
 */
export async function getGroupManagers(
    groupId: string,
    options: { refresh?: boolean } = {},
): Promise<GroupManagers> {
    const store = load();
    const hit = store[groupId];

    if (!options.refresh && hit) {
        return { groupId, owner: hit.owner, admins: hit.admins, updatedAt: hit.updatedAt, cached: true };
    }

    try {
        const live = await fetchLive(groupId);
        const entry: CacheEntry = { owner: live.owner, admins: live.admins, updatedAt: Date.now() };
        store[groupId] = entry;
        persist();
        logDebug(
            `[群管助手] 群 ${groupId} 群主 / 管理员：实时拉取（群主 ${entry.owner?.userId ?? '无'}，管理员 ${entry.admins.length} 人）`,
        );
        return { groupId, owner: entry.owner, admins: entry.admins, updatedAt: entry.updatedAt, cached: false };
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        logWarn(`[群管助手] 群 ${groupId} 群主 / 管理员实时拉取失败:`, e);
        if (hit) {
            return {
                groupId,
                owner: hit.owner,
                admins: hit.admins,
                updatedAt: hit.updatedAt,
                cached: true,
                error,
            };
        }
        return { groupId, owner: null, admins: [], updatedAt: 0, cached: false, error };
    }
}

/** 取事件里的号码字段（兼容下划线 / 驼峰命名） */
function numberOf(event: RawEventLike, keys: string[]): string {
    const raw = event as unknown as Record<string, unknown>;
    for (const key of keys) {
        const value = raw[key];
        if (value === undefined || value === null || String(value).trim() === '') continue;
        return String(value).trim();
    }
    return '';
}

/**
 * group_admin 通知：管理员被设置 / 撤销时增量更新本地记录。
 *
 * 事件形态（OneBot 11）：{ notice_type: 'group_admin', sub_type: 'set' | 'unset',
 * group_id, user_id, ... }，user_id 是「被任免的人」，不一定是 Bot；
 * 标准事件不保证带 operator_id，所以这里也不依赖它。
 *
 * 注意：这里只维护管理员列表。群主转让没有独立的 group_admin 通知
 * （新群主只是 role 变成 owner，旧群主变普通成员），不做特殊处理，
 * 数据对不上时由界面上的「刷新」按钮手动重新拉取。
 *
 * 没记录过这个群就直接跳过 —— 下次拉取会拿到全量数据，避免拼出残缺的记录。
 */
export function applyGroupAdminNotice(event: RawEventLike): void {
    const groupId = numberOf(event, ['group_id', 'groupId']);
    const userId = numberOf(event, ['user_id', 'userId']);
    const subType = String(event.sub_type ?? '').toLowerCase();
    // 调试期先裸打全量事件，便于确认字段名 / 事件是否真的上报（NapCat 各版本有出入）
    logDebug(`[群管助手] group_admin 原始事件: ${JSON.stringify(event)}`);
    if (!groupId || !userId) {
        logWarn('[群管助手] group_admin 事件缺少 group_id / user_id，已跳过:', event);
        return;
    }
    if (subType !== 'set' && subType !== 'unset') {
        logDebug(`[群管助手] group_admin 未知 sub_type=${subType}，已跳过`);
        return;
    }

    const store = load();
    const entry = store[groupId];
    if (!entry) return;
    // 群主不在管理员列表里，通知只作用于管理员
    if (entry.owner && entry.owner.userId === userId) return;

    const admins = entry.admins.filter((a) => a.userId !== userId);
    if (subType === 'set') {
        const name = getCachedNickname(groupId, userId);
        admins.push({ userId, ...(name ? { name } : {}) });
    } else if (admins.length === entry.admins.length) {
        return; // 本来就不在列表里，无需改动
    }

    store[groupId] = { owner: entry.owner, admins, updatedAt: Date.now() };
    persist();
    logDebug(`[群管助手] 群 ${groupId} 管理员${subType === 'set' ? '新增' : '移除'} ${userId}（本地记录已更新）`);
}

/**
 * group_decrease 通知：成员退群 / 被踢时增量更新本地记录。
 *   - 退的是管理员 → 从列表移除
 *   - 退的是群主 → 群主会自动转移，本地无从得知，删掉记录让下次强制实时拉取
 */
export function applyMemberDecreaseNotice(event: RawEventLike): void {
    const groupId = numberOf(event, ['group_id', 'groupId']);
    const userId = numberOf(event, ['user_id', 'userId']);
    if (!groupId || !userId) return;

    const store = load();
    const entry = store[groupId];
    if (!entry) return;

    if (entry.owner && entry.owner.userId === userId) {
        delete store[groupId];
        persist();
        logDebug(`[群管助手] 群 ${groupId} 群主 ${userId} 已退群，本地记录失效，下次重新拉取`);
        return;
    }

    const admins = entry.admins.filter((a) => a.userId !== userId);
    if (admins.length === entry.admins.length) return;
    store[groupId] = { owner: entry.owner, admins, updatedAt: Date.now() };
    persist();
    logDebug(`[群管助手] 群 ${groupId} 管理员 ${userId} 已退群（本地记录已更新）`);
}

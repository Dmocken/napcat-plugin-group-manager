/**
 * QQ 昵称反查
 *
 * 命令消息可以从 sender.nickname 直接拿到昵称，但通知 / 请求类事件
 * （加群申请、入群、禁言通知、撤回通知…）协议端只给 QQ 号，
 * 因此这里按需反查并缓存，供功能调用日志与错误记录显示「是谁」。
 *
 * 调用点都在事件处理前，所以要控住最坏耗时：单次查询有超时保护，
 * 命中缓存（含「查不到」的短缓存）时零成本。
 */

import { callAction } from './messages';

/** 查到的昵称缓存 10 分钟 */
const NAME_TTL = 10 * 60 * 1000;
/** 查不到时缓存 1 分钟，避免接口异常时每个事件都白等一次 */
const MISS_TTL = 60 * 1000;
/** 缓存条目上限，超了直接整体清空（昵称不是关键路径，不必精细淘汰） */
const MAX_ENTRIES = 500;
/** 单次查询超时：拿不到就留空，不能拖住事件处理 */
const LOOKUP_TIMEOUT = 1200;

interface Entry {
    name: string;
    at: number;
}

const cache = new Map<string, Entry>();
/** 同一目标并发只发一次请求 */
const pending = new Map<string, Promise<string>>();

function keyOf(groupId: number | string, userId: string): string {
    const group = Number(groupId) || 0;
    return group ? `${group}_${userId}` : `u_${userId}`;
}

/**
 * 只读昵称缓存，不发任何请求；命中「查不到」的短缓存也照样返回空串。
 *
 * 给「人已经不在群里」的事件用：退群 / 被踢之后、调 get_group_member_info
 * 必然失败（NapCat 还会打一条「群(...)成员xxx不存在」的 ERROR 噪音），
 * 所以先用这条接口看看缓存里有没有之前查到的名字（之前被禁言过就有），
 * 没有就空着，活动日志只会显示 QQ 号。
 */
export function getCachedNickname(
    groupId: number | string,
    userId: number | string,
): string {
    const id = String(userId ?? '').trim();
    if (!id || id === '0') return '';

    const hit = cache.get(keyOf(groupId, id));
    if (!hit) return '';
    // 命中「查不到」也直接返回空串（保持与 resolveNickname 一致：不区分两种"空"）
    return hit.name;
}

function withTimeout(ms: number): Promise<null> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(null), ms);
    });
}

interface NameInfo {
    nickname?: string;
    card?: string;
}

function nameOf(raw: NameInfo | null): string {
    return String(raw?.nickname || raw?.card || '').trim();
}

/** 调一次查询接口，失败 / 超时都返回 null */
async function ask(action: string, params: Record<string, unknown>): Promise<NameInfo | null> {
    try {
        return await Promise.race([
            callAction<NameInfo>(action, params),
            withTimeout(LOOKUP_TIMEOUT),
        ]);
    } catch {
        return null;
    }
}

/**
 * 真正发起查询：
 *   1. 在群里的人 → 群成员信息（最准，能拿到群名片）
 *   2. 查不到（如还没通过审核的申请人、已退群的人）→ 陌生人信息兜底
 */
async function lookup(groupId: number | string, userId: string): Promise<string> {
    const group = Number(groupId) || 0;
    if (group) {
        const member = nameOf(
            await ask('get_group_member_info', { group_id: String(group), user_id: userId }),
        );
        if (member) return member;
    }
    return nameOf(await ask('get_stranger_info', { user_id: userId }));
}

/**
 * 取昵称：命中缓存直接返回，否则反查。
 * @returns 拿不到时返回空串，调用方按「没有昵称」处理
 */
export async function resolveNickname(
    groupId: number | string,
    userId: number | string,
): Promise<string> {
    const id = String(userId ?? '').trim();
    if (!id || id === '0') return '';

    const key = keyOf(groupId, id);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < (hit.name ? NAME_TTL : MISS_TTL)) return hit.name;

    const running = pending.get(key);
    if (running) return running;

    const task = (async (): Promise<string> => {
        const name = await lookup(groupId, id);
        if (cache.size >= MAX_ENTRIES) cache.clear();
        cache.set(key, { name, at: Date.now() });
        return name;
    })();

    pending.set(key, task);
    try {
        return await task;
    } finally {
        pending.delete(key);
    }
}

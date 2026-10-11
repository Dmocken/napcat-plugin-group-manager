/**
 * 最近群消息内容缓存（撤回记录用）
 *
 * 撤回通知 group_recall 里只有 message_id，没有正文；等通知到了再调 get_msg，
 * 消息通常已经被删掉、查不到内容，于是撤回记录里只剩「消息内容已不可获取」。
 * 所以收到的群消息先在这里按 message_id 留一份文本，撤回时直接取回。
 *
 * 纯内存、只留最近 KEEP 条，插件重启即清空（跨重启的撤回没有意义）。
 */

import type { RawEventLike } from '../types';
import { describeSegments } from './messages';

/** 保留条数：一条几十个字符，几百条的内存占用可以忽略 */
const KEEP = 300;

/** message_id → 可读文本；Map 的插入顺序就是新旧顺序，超量时删最旧的一条 */
const cache = new Map<string, string>();

/** 收到群消息时留一份内容；非群聊 / 没 message_id / 没内容的跳过 */
export function rememberGroupMessage(event: RawEventLike): void {
    if (event.message_type !== 'group') return;

    const id = event.message_id;
    if (id === undefined || id === null) return;

    const key = String(id);
    if (!key || key === '0') return;

    const text = describeSegments(event.message);
    if (!text) return;

    // 先删再插：让这条回到「最新」，超过上限时先淘汰真正的旧消息
    cache.delete(key);
    cache.set(key, text);

    while (cache.size > KEEP) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

/** 取回某条消息的内容；没有缓存（或本条不是群消息）时返回 undefined */
export function cachedMessageText(messageId: string | number | undefined): string | undefined {
    if (messageId === undefined || messageId === null || messageId === '') return undefined;
    return cache.get(String(messageId));
}

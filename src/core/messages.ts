/**
 * 消息与 OneBot Action 封装
 */

import type { MessageSegmentLike, RawEventLike } from '../types';
import { assetsDirs, fileToBase64, resolveAsset } from './store';
import { ctx, getGlobal, logDebug, logError, logWarn } from './state';

export type Seg = MessageSegmentLike;

/** ctx.actions.call 的强类型联合过于严格，这里统一放宽 */
interface LooseActionMap {
    call(action: string, params: Record<string, unknown>, adapter: string, config: unknown): Promise<any>;
}

/**
 * NapCat 对「没有返回值的操作型接口」（set_group_ban / set_group_kick /
 * set_group_add_request / delete_msg 等，返回 Schema 是 Null）在成功时会抛
 * `Action xxx failed: No data returned`，这实际上是成功的信号。
 */
function isNoDataReturned(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e ?? '');
    return /no data returned/i.test(msg);
}

/** 调用 OneBot Action，自动拆掉 OB11Return 外壳 */
export async function callAction<T = any>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const c = ctx();
    const actions = c.actions as unknown as LooseActionMap;
    try {
        const res = await actions.call(action, params, c.adapterName, c.pluginManager.config);
        if (res && typeof res === 'object' && 'retcode' in res && 'data' in res) {
            return (res as { data: T }).data;
        }
        return res as T;
    } catch (e) {
        // 操作型接口没有 data，NapCat 会抛这个错误，但操作其实已经生效 → 按成功处理
        if (isNoDataReturned(e)) {
            logDebug(`[群管助手] ${action} 无返回值（操作型接口，按成功处理）`);
            return null as T;
        }
        throw e;
    }
}

/* ---------------- 消息段 ---------------- */

export function seg(type: string, data: Record<string, any>): Seg {
    return { type, data };
}

export function text(content: string): Seg {
    return seg('text', { text: content });
}

export function at(qq: number | string): Seg {
    return seg('at', { qq: String(qq) });
}

export function image(file: string): Seg {
    return seg('image', { file });
}

function toMessage(message: string | Seg[]): Seg[] {
    if (typeof message === 'string') return message ? [text(message)] : [];
    return message;
}

/* ---------------- 发送 ---------------- */

/** 消息摘要（用于失败日志） */
function brief(message: string | Seg[]): string {
    const s =
        typeof message === 'string'
            ? message
            : message
                  .map((seg) => (seg.type === 'text' ? String(seg.data?.text ?? '') : `[${seg.type}]`))
                  .join('');
    const one = s.replace(/\s+/g, ' ').trim();
    return one.length > 100 ? `${one.slice(0, 100)}…` : one;
}

export async function sendGroup(groupId: number | string, message: string | Seg[]): Promise<void> {
    try {
        await callAction('send_group_msg', { group_id: String(groupId), message: toMessage(message) });
    } catch (e) {
        logError(`[群管助手] 发送群消息失败 group=${groupId} 内容="${brief(message)}":`, e);
    }
}

export async function sendPrivate(userId: number | string, message: string | Seg[]): Promise<void> {
    try {
        await callAction('send_private_msg', { user_id: String(userId), message: toMessage(message) });
    } catch (e) {
        logError(`[群管助手] 发送私聊消息失败 user=${userId} 内容="${brief(message)}":`, e);
    }
}

/** 合并转发节点上限（NapCat 保守值） */
const NODES_PER_BATCH = 50;

export interface ForwardNode {
    content: string | Seg[];
    nickname?: string;
    userId?: string;
}

let cachedSelfId = '';

export async function getSelfId(): Promise<string> {
    if (cachedSelfId) return cachedSelfId;
    try {
        const info = await callAction<{ user_id?: number | string }>('get_login_info');
        cachedSelfId = String(info?.user_id ?? '');
    } catch {
        cachedSelfId = '';
    }
    return cachedSelfId;
}

/**
 * 发送合并转发消息；失败时降级为普通文本消息
 * @returns 是否以合并转发形式发送成功
 */
export async function sendForward(opts: {
    groupId?: number | string;
    userId?: number | string;
    title: string;
    lines: string[];
}): Promise<boolean> {
    const selfId = await getSelfId();
    const nickname = '群管理助手';

    const buildNodes = (items: string[]): Seg[] =>
        items.map((line) => seg('node', { user_id: selfId, nickname, content: [text(line)] }));

    const nodes = buildNodes([`📋 ${opts.title}`, ...opts.lines]);
    const isGroup = opts.groupId !== undefined && opts.groupId !== 0;

    try {
        for (let i = 0; i < nodes.length; i += NODES_PER_BATCH) {
            const batch = nodes.slice(i, i + NODES_PER_BATCH);
            if (isGroup) {
                await callAction('send_group_forward_msg', { group_id: String(opts.groupId), messages: batch });
            } else {
                await callAction('send_private_forward_msg', { user_id: String(opts.userId), messages: batch });
            }
        }
        return true;
    } catch (e) {
        logDebug('[群管助手] 合并转发失败，降级为普通消息:', e);
        const fallback = `📋 ${opts.title}\n\n${opts.lines.join('\n')}`;
        if (isGroup) await sendGroup(opts.groupId as number, fallback);
        else await sendPrivate(opts.userId as number, fallback);
        return false;
    }
}

/* ---------------- 消息解析 ---------------- */

export function segmentsOf(event: RawEventLike): Seg[] {
    return Array.isArray(event.message) ? event.message : [];
}

/** 消息中的纯文本（拼接所有 text 段；无 message 数组时退回 raw_message） */
export function plainTextOf(event: RawEventLike): string {
    const segs = segmentsOf(event);
    if (!segs.length) return (event.raw_message ?? '').trim();
    return segs
        .filter((s) => s.type === 'text')
        .map((s) => String(s.data?.text ?? ''))
        .join('')
        .trim();
}

/** 消息中 @ 到的 QQ 号 */
export function atTargetsOf(event: RawEventLike): string[] {
    return segmentsOf(event)
        .filter((s) => s.type === 'at')
        .map((s) => String(s.data?.qq ?? ''))
        .filter(Boolean);
}

/** 引用消息的 message_id（无引用返回 null） */
export function replyIdOf(event: RawEventLike): string | null {
    const reply = segmentsOf(event).find((s) => s.type === 'reply');
    const id = reply?.data?.id;
    return id === undefined || id === null ? null : String(id);
}

/* ---------------- 文案渲染（支持 {time} / {image=...}） ---------------- */

const IMAGE_MARKER = /\{image=([^}]+)\}/g;

/** 单张图片 base64 文本上限（过大容易被协议端拒收） */
const MAX_IMAGE_BASE64 = 2 * 1024 * 1024;

/**
 * 渲染文案为消息段列表：
 * - {key} 形式的变量会被替换为 vars[key]
 * - {image=/assets/x.png} 会被替换为图片消息段（读取文件转 base64）
 */
export function renderTemplate(template: string, vars: Record<string, string> = {}): Seg[] {
    let body = template;
    for (const [k, v] of Object.entries(vars)) {
        body = body.split(`{${k}}`).join(v);
    }

    const pluginPath = ctx().pluginPath;
    const out: Seg[] = [];
    let cursor = 0;

    for (const m of body.matchAll(IMAGE_MARKER)) {
        const start = m.index ?? 0;
        if (start > cursor) out.push(text(body.slice(cursor, start)));
        const abs = resolveAsset(m[1], pluginPath);
        const data = abs ? fileToBase64(abs) : null;
        if (!data) {
            logWarn(`[群管助手] 图片标记未解析到文件，已跳过: ${m[1]}（assets 目录：${assetsDirs(pluginPath).join(' | ')}）`);
        } else if (data.length > MAX_IMAGE_BASE64) {
            logWarn(`[群管助手] 图片过大已跳过（约 ${Math.round(data.length / 1024 / 1024)} MB）: ${m[1]}`);
        } else {
            out.push(image(data));
        }
        cursor = start + m[0].length;
    }

    if (cursor < body.length) out.push(text(body.slice(cursor)));
    return out;
}

/** 命令前缀（支持配置，同时兼容 / ） */
export function commandPrefix(): string {
    return getGlobal().command_prefix || '/';
}

/** 无权限等统一提示 */
export const MESSAGES = {
    noPermission: '您没有权限使用该功能。',
    featureDisabled: '本群未启用该功能。',
    pluginDisabled: '插件总开关已关闭。',
    needGroup: '该命令只能在群聊中使用。',
    needPrivate: '该命令只能在私聊中使用。',
};

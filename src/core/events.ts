/**
 * 通知 / 请求事件分发
 *
 * plugin_onevent 收到的所有事件在这里按 notice_type / request_type 分派，
 * 并统一做「插件总开关 + 该群该功能是否启用」的前置检查。
 * 后续阶段的功能（newban / check_silent / join_verify / recall_stats）只需注册处理器。
 */

import type { FeatureKey, RawEventLike } from '../types';
import { beginActivity } from './activity';
import { resolveNickname } from './nicknames';
import { getFeatureSettings } from './profiles';
import { isPluginEnabled } from './permission';
import { logError, stats, logDebug } from './state';

export interface EventContext {
    event: RawEventLike;
    groupId: number;
    /** 事件主体（被禁言者 / 入群者 / 撤回的消息发送者） */
    userId: number;
    /** 操作者（禁言人 / 踢人者 / 撤回人） */
    operatorId: number;
}

export type NoticeHandler = (c: EventContext) => Promise<void> | void;
export type RequestHandler = (c: EventContext) => Promise<void> | void;

interface Registered<T> {
    kind: T;
    /** null 表示不受群功能开关限制（只受插件总开关限制），用于「任何群都要记录」的场景 */
    feature: FeatureKey | null;
    handler: NoticeHandler;
}

const noticeHandlers: Registered<string>[] = [];
const requestHandlers: Registered<string>[] = [];

export function registerNotice(
    noticeType: string,
    feature: FeatureKey | null,
    handler: NoticeHandler,
): void {
    noticeHandlers.push({ kind: noticeType, feature, handler });
}

export function registerRequest(
    requestType: string,
    feature: FeatureKey | null,
    handler: RequestHandler,
): void {
    requestHandlers.push({ kind: requestType, feature, handler });
}

/**
 * 取号码字段：不同 NapCat 版本 / 事件类型的字段名可能是下划线或驼峰
 * （例如加群请求只给 groupId / userId），因此逐个候选尝试。
 */
function numberOf(event: RawEventLike, keys: string[]): number {
    const raw = event as unknown as Record<string, unknown>;
    for (const key of keys) {
        const value = raw[key];
        if (value === undefined || value === null || String(value).trim() === '') continue;
        const num = Number(value);
        if (Number.isFinite(num) && num !== 0) return num;
    }
    return 0;
}

function buildContext(event: RawEventLike): EventContext {
    return {
        event,
        groupId: numberOf(event, ['group_id', 'groupId', 'groupCode']),
        userId: numberOf(event, ['user_id', 'userId']),
        operatorId: numberOf(event, ['operator_id', 'operatorId']),
    };
}

/** 取字符串字段（同样兼容驼峰命名） */
function textOf(event: RawEventLike, keys: string[]): string {
    const raw = event as unknown as Record<string, unknown>;
    for (const key of keys) {
        const value = raw[key];
        if (value === undefined || value === null || String(value).trim() === '') continue;
        return String(value).trim();
    }
    return '';
}

/** 事件摘要：给「最近调用」面板说明是什么触发了这次处理 */
function eventSummary(event: RawEventLike): string {
    const parts: string[] = [];
    const subType = textOf(event, ['sub_type', 'subType']);
    if (subType) parts.push(subType);

    const operatorId = numberOf(event, ['operator_id', 'operatorId']);
    if (operatorId) parts.push(`操作者 ${operatorId}`);

    const userId = numberOf(event, ['user_id', 'userId']);
    if (userId) parts.push(`目标 ${userId}`);

    const duration = numberOf(event, ['duration']);
    if (duration) parts.push(`时长 ${duration}s`);

    const comment = textOf(event, ['comment', 'postscript', 'message']);
    if (comment) parts.push(`留言 ${comment}`);

    const flag = textOf(event, ['flag']);
    if (flag) parts.push(`flag ${flag}`);

    return parts.join(' · ');
}

async function run(
    handlers: Registered<string>[],
    kind: string,
    event: RawEventLike,
    label: string
): Promise<boolean> {
    const matched = handlers.filter((h) => h.kind === kind);
    if (!matched.length) return false;

    const context = buildContext(event);
    let handled = false;

    for (const h of matched) {
        // 该群未启用此功能 → 跳过（feature 为 null 表示不受群开关限制）
        if (h.feature && context.groupId && !getFeatureSettings(context.groupId, h.feature).enabled) continue;
        handled = true;
        stats.eventHandled += 1;

        // 事件通知不带昵称，按需反查（有缓存与超时保护）
        const actorId = context.operatorId || context.userId;
        const userName = await resolveNickname(context.groupId, actorId);

        const activity = beginActivity({
            source: 'event',
            action: `${label}:${kind}`,
            feature: h.feature ?? 'system',
            groupId: context.groupId,
            userId: actorId,
            userName,
            input: eventSummary(event),
        });

        try {
            logDebug(`[群管助手] 事件 ${label}/${kind} | 群 ${context.groupId}`);
            await h.handler(context);
            activity.finish('ok');
        } catch (e) {
            // 上下文显式传入：不依赖全局 activeErrorContext，避免与并发的命令记录互相覆盖
            logError(`[群管助手] 处理事件 ${label}/${kind} 失败:`, e, {
                source: 'event',
                feature: h.feature ?? 'system',
                groupId: context.groupId,
                userId: actorId,
                userName,
            });
            activity.finish('fail', e instanceof Error ? e.message : String(e));
        }
    }

    return handled;
}

export async function dispatchNotice(event: RawEventLike): Promise<boolean> {
    if (!isPluginEnabled()) return false;
    const kind = event.notice_type ?? '';
    if (!kind) return false;
    return run(noticeHandlers, kind, event, 'notice');
}

export async function dispatchRequest(event: RawEventLike): Promise<boolean> {
    if (!isPluginEnabled()) return false;
    const kind = event.request_type ?? '';
    if (!kind) return false;
    return run(requestHandlers, kind, event, 'request');
}

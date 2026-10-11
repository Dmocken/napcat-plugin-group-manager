/**
 * 通知 / 请求事件分发
 *
 * plugin_onevent 收到的所有事件在这里按 notice_type / request_type 分派，
 * 并统一做「插件总开关 + 该群该功能是否启用」的前置检查。
 * 后续阶段的功能（newban / check_silent / join_verify / recall_stats）只需注册处理器。
 */

import type { FeatureKey, RawEventLike } from '../types';
import { beginActivity } from './activity';
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

function buildContext(event: RawEventLike): EventContext {
    return {
        event,
        groupId: Number(event.group_id ?? 0),
        userId: Number(event.user_id ?? 0),
        operatorId: Number(event.operator_id ?? 0),
    };
}

/** 事件摘要：给「最近调用」面板说明是什么触发了这次处理 */
function eventSummary(event: RawEventLike): string {
    const parts: string[] = [];
    if (event.sub_type) parts.push(String(event.sub_type));
    if (event.operator_id) parts.push(`操作者 ${event.operator_id}`);
    if (event.user_id) parts.push(`目标 ${event.user_id}`);
    if (event.duration) parts.push(`时长 ${event.duration}s`);
    if (event.comment) parts.push(`留言 ${event.comment}`);
    if (event.flag) parts.push(`flag ${event.flag}`);
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

        const activity = beginActivity({
            source: 'event',
            action: `${label}:${kind}`,
            feature: h.feature ?? 'system',
            groupId: context.groupId,
            userId: context.operatorId || context.userId,
            input: eventSummary(event),
        });

        try {
            logDebug(`[群管助手] 事件 ${label}/${kind} | 群 ${context.groupId}`);
            await h.handler(context);
            activity.finish('ok');
        } catch (e) {
            logError(`[群管助手] 处理事件 ${label}/${kind} 失败:`, e);
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

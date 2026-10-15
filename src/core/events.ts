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
import { logError, logDebug, setActiveErrorContext, stats } from './state';

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

    // 该群未启用此功能 → 跳过（feature 为 null 表示不受群开关限制）
    const runnable = matched.filter(
        (h) =>
            !h.feature ||
            !context.groupId ||
            getFeatureSettings(context.groupId, h.feature).enabled,
    );
    if (!runnable.length) return false;

    // 一次事件只记一条调用日志。
    // 同一个事件可能被多个处理器关心（例如退群同时挂了退群标记 / 踢人回执 / 踢人保护），
    // 以前是每个处理器各记一条，导致日志里出现多条内容完全相同的记录。
    const features = [
        ...new Set(runnable.map((h) => h.feature).filter((f): f is FeatureKey => f !== null)),
    ];
    const feature = features.length === 1 ? features[0] : 'system';

    // 事件通知不带昵称，按需反查（有缓存与超时保护）
    const actorId = context.operatorId || context.userId;
    const userName = await resolveNickname(context.groupId, actorId);

    stats.eventHandled += 1;

    const activity = beginActivity({
        source: 'event',
        action: `${label}:${kind}`,
        feature,
        groupId: context.groupId,
        userId: actorId,
        userName,
        input: eventSummary(event),
    });

    logDebug(`[群管助手] 事件 ${label}/${kind} | 群 ${context.groupId}`);

    // 处理器之间互相独立：某一个抛错不影响后面的，最后汇总进同一条日志的结果里
    let failure = '';
    for (const h of runnable) {
        // 挂上上下文：handler 内部自己 catch 后再 logError 的（比如 AI 判断失败、禁言失败）
        // 也能带上「哪个功能、哪个群、哪个用户」，与命令路由的做法保持一致
        setActiveErrorContext({
            source: 'event',
            command: `${label}:${kind}`,
            feature,
            groupId: context.groupId,
            userId: actorId,
            userName,
        });
        try {
            await h.handler(context);
        } catch (e) {
            failure = e instanceof Error ? e.message : String(e);
            // 上下文显式传入：即便上面挂的全局上下文被并发的命令 / 事件覆盖，这里也不会丢
            logError(`[群管助手] 处理事件 ${label}/${kind} 失败:`, e, {
                source: 'event',
                command: `${label}:${kind}`,
                feature,
                groupId: context.groupId,
                userId: actorId,
                userName,
            });
        } finally {
            setActiveErrorContext(null);
        }
    }

    if (failure) activity.finish('fail', failure);
    else activity.finish('ok');

    return true;
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

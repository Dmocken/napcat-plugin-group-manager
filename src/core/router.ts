/**
 * 命令路由
 *
 * NapCat 插件没有 NoneBot 的 matcher / priority / block 体系，
 * 这里用「注册顺序 + block 标记」实现等价语义：
 * 命中的命令按注册顺序执行，遇到 block = true 的命令后停止继续匹配。
 */

import type { CommandContext, FeatureKey, RawEventLike } from '../types';
import {
    atTargetsOf,
    commandPrefix,
    MESSAGES,
    plainTextOf,
    sendGroup,
    sendPrivate,
    segmentsOf,
} from './messages';
import { canToggle, canUse, isPluginEnabled } from './permission';
import { ctx, logDebug, logError, setActiveErrorContext, stats } from './state';

export type PermissionKind = 'use' | 'toggle' | 'none';
export type CommandScope = 'group' | 'private' | 'both';

export interface CommandDef {
    /** 主命令名（不带前缀，统一小写） */
    name: string;
    /** 别名（统一小写） */
    aliases?: string[];
    /** 所属功能；'system' 表示不参与功能权限矩阵 */
    feature: FeatureKey | 'system';
    description: string;
    /** 命中后是否阻断后续命令匹配 */
    block?: boolean;
    /** 是否必须带命令前缀（sm 这类裸命令为 false） */
    prefixRequired?: boolean;
    permission?: PermissionKind;
    scope?: CommandScope;
    handler: (c: CommandContext) => Promise<void> | void;
}

const commands: CommandDef[] = [];

export function registerCommand(def: CommandDef): void {
    commands.push({ permission: 'use', scope: 'both', prefixRequired: true, ...def });
}

export function registeredCommands(): CommandDef[] {
    return commands;
}

function namesOf(def: CommandDef): string[] {
    return [def.name, ...(def.aliases ?? [])].map((n) => n.toLowerCase());
}

/**
 * 取出用于解析命令的文本
 *
 * 注意：不能直接用 raw_message —— 消息里带 @ 时（例如「@机器人 /ban @某人 1 分」）
 * raw_message 是 CQ 码形式（[CQ:at,qq=...] ...），命令名会被埋在后面导致解析失败；
 * 因此优先用「文本段拼接」的纯文本视图，没有消息段时再退回 raw_message。
 */
function parseSource(event: RawEventLike): string {
    const segs = segmentsOf(event);
    if (segs.length) return plainTextOf(event).trim();
    return (event.raw_message ?? '').trim();
}

/** 解析命令与参数 */
function parse(event: RawEventLike): { hasPrefix: boolean; tokens: string[]; argText: string } | null {
    const raw = parseSource(event);
    if (!raw) return null;

    const prefix = commandPrefix();
    let body = raw;
    let hasPrefix = false;

    if (prefix && raw.startsWith(prefix)) {
        body = raw.slice(prefix.length).trim();
        hasPrefix = true;
    } else if (prefix !== '/' && raw.startsWith('/')) {
        body = raw.slice(1).trim();
        hasPrefix = true;
    }

    const tokens = body.split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;

    // 命令名之后保留原始文本（去掉命令名本身）
    const first = tokens[0];
    const argText = body.slice(body.indexOf(first) + first.length).trim();

    return { hasPrefix, tokens, argText };
}

function isScopeAllowed(def: CommandDef, isGroup: boolean): boolean {
    const scope = def.scope ?? 'both';
    if (scope === 'both') return true;
    return scope === 'group' ? isGroup : !isGroup;
}

/**
 * 分发消息事件
 * @returns 是否命中了任一命令
 */
export async function dispatchMessage(event: RawEventLike): Promise<boolean> {
    stats.messageReceived += 1;
    if (!isPluginEnabled()) return false;

    const parsed = parse(event);
    if (!parsed) return false;

    const { hasPrefix, tokens, argText } = parsed;
    const first = tokens[0].toLowerCase();
    const isGroup = event.message_type === 'group';

    let matched = false;

    for (const def of commands) {
        if (!namesOf(def).includes(first)) continue;
        if ((def.prefixRequired ?? true) !== hasPrefix) continue;
        if (!isScopeAllowed(def, isGroup)) {
            await replyHint(event, isGroup ? MESSAGES.needPrivate : MESSAGES.needGroup);
            return true;
        }

        const context = buildContext(event, def, tokens, argText, isGroup);
        matched = true;

        const kind = def.permission ?? 'use';
        if (kind !== 'none' && isGroup && context.groupId) {
            const ok = kind === 'toggle'
                ? canToggle(context.groupId, context.userId, context.role, def.feature)
                : canUse(context.groupId, context.userId, context.role, def.feature);
            if (!ok) {
                await sendGroup(context.groupId, MESSAGES.noPermission);
                logDebug(`[群管助手] 拒绝 ${context.userId} 在群 ${context.groupId} 使用 ${def.name}`);
                break;
            }
        }

        try {
            stats.commandHandled += 1;
            logDebug(`[群管助手] 执行命令 ${def.name} | 群 ${context.groupId} | 用户 ${context.userId}`);
            // 挂上上下文，handler 内部 logError 也会记录到功能 / 群 / 用户
            setActiveErrorContext({
                source: 'command',
                command: def.name,
                feature: def.feature,
                groupId: context.groupId,
                userId: context.userId,
            });
            await def.handler(context);
        } catch (e) {
            logError(`[群管助手] 命令 ${def.name} 执行失败:`, e);
        } finally {
            setActiveErrorContext(null);
        }

        if (def.block) break;
    }

    return matched;
}

function buildContext(
    event: RawEventLike,
    def: CommandDef,
    tokens: string[],
    argText: string,
    isGroup: boolean
): CommandContext {
    return {
        event,
        groupId: isGroup ? Number(event.group_id ?? 0) : 0,
        userId: Number(event.user_id ?? 0),
        role: event.sender?.role ?? 'member',
        command: def.name,
        argv: tokens.slice(1),
        argText,
        atTargets: atTargetsOf(event),
        plainText: parseSource(event),
    };
}

async function replyHint(event: RawEventLike, message: string): Promise<void> {
    const isGroup = event.message_type === 'group';
    const groupId = Number(event.group_id ?? 0);
    const userId = Number(event.user_id ?? 0);
    if (isGroup && groupId) {
        await sendGroup(groupId, message);
    } else if (userId) {
        await sendPrivate(userId, message);
    }
}

/** 供 /help 使用：列出该群已启用的功能说明 */
export function helpText(enabledKeys: string[]): string {
    const lines = ['📖 群管助手 · 可用功能', '━━━━━━━━━━━━━━━'];
    if (!enabledKeys.length) {
        lines.push('本群暂未启用任何功能，请联系 Bot 管理员配置。');
        return lines.join('\n');
    }
    for (const def of commands) {
        if (def.feature === 'system') continue;
        if (!enabledKeys.includes(def.feature)) continue;
        lines.push(`▸ ${def.description}`);
    }
    lines.push('━━━━━━━━━━━━━━━');
    lines.push(`命令前缀：${commandPrefix()}`);
    return lines.join('\n');
}

/** 供调试用：当前事件的消息段类型 */
export function debugSegments(event: RawEventLike): string {
    return segmentsOf(event)
        .map((s) => s.type)
        .join(',');
}

export function pluginName(): string {
    return ctx().pluginName;
}

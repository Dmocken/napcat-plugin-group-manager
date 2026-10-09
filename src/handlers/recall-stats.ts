/**
 * 撤回消息统计（对应 nonebot/recall_stats.py）
 *
 * - 监听 group_recall：仅记录「管理员撤回他人消息」，达到阈值时提醒被撤回人
 * - 群内：recall open / recall close
 * - 私聊：recall <群号> <QQ号> 查询被撤回记录（合并转发）
 */

import type { MessageSegmentLike, RawEventLike } from '../types';
import { registerNotice } from '../core/events';
import { at, callAction, MESSAGES, sendForward, sendGroup, sendPrivate, text } from '../core/messages';
import { canToggle, isGlobalAdmin } from '../core/permission';
import { getFeatureSettings, setFeatureEnabled } from '../core/profiles';
import { registerCommand } from '../core/router';
import { logDebug, logError } from '../core/state';
import { readJson, writeJson } from '../core/store';
import { paramNumberList, paramString } from '../core/utils';

const DATA_FILE = 'recall_records.json';
const FORWARD_NICKNAME = '群管理助手';
const DEFAULT_WARNING = '您已被撤回消息 {count} 次，请注意言行，遵守群规！';

interface RecallEntry {
    operator_id: number;
    operator_name: string;
    message: string;
    timestamp: number;
}

interface RecallUserData {
    count: number;
    records: RecallEntry[];
}

type RecallData = Record<string, Record<string, RecallUserData>>;

function loadRecords(): RecallData {
    const data = readJson<RecallData>(DATA_FILE, {});
    return data && typeof data === 'object' ? data : {};
}

function saveRecords(data: RecallData): void {
    writeJson(DATA_FILE, data);
}

function getUserRecords(data: RecallData, groupId: number | string, userId: number | string): RecallUserData | undefined {
    return data[String(groupId)]?.[String(userId)];
}

/** 把消息段转成可读文本，便于事后查看 */
function describeSegments(segments: MessageSegmentLike[] | string | undefined): string {
    if (!segments) return '[消息内容已不可获取]';
    if (typeof segments === 'string') return segments;

    return segments
        .map((s) => {
            switch (s.type) {
                case 'text':
                    return String(s.data?.text ?? '');
                case 'image':
                    return '[图片]';
                case 'face':
                    return '[表情]';
                case 'at':
                    return `@${s.data?.qq ?? ''}`;
                case 'reply':
                    return '[回复]';
                default:
                    return `[${s.type}]`;
            }
        })
        .join('');
}

async function fetchMessageText(messageId: string | number): Promise<string> {
    try {
        const msg = await callAction<{ message?: MessageSegmentLike[] | string }>('get_msg', {
            message_id: String(messageId),
        });
        return describeSegments(msg?.message);
    } catch {
        return '[消息内容已不可获取]';
    }
}

async function fetchMemberName(groupId: number, userId: number): Promise<string> {
    try {
        const info = await callAction<{ card?: string; nickname?: string }>('get_group_member_info', {
            group_id: String(groupId),
            user_id: String(userId),
            no_cache: false,
        });
        return info?.card || info?.nickname || String(userId);
    } catch {
        return String(userId);
    }
}

/* ---------------- 撤回事件 ---------------- */

registerNotice('group_recall', 'recall_stats', async (ctx) => {
    const { groupId } = ctx;
    const targetId = ctx.userId;
    const operatorId = ctx.operatorId;

    // 用户自行撤回的不记录
    if (!groupId || !targetId || !operatorId || operatorId === targetId) return;

    const event = ctx.event as RawEventLike;
    const messageText = event.message
        ? describeSegments(event.message)
        : await fetchMessageText(event.message_id ?? '');

    const [operatorName, targetName] = await Promise.all([
        fetchMemberName(groupId, operatorId),
        fetchMemberName(groupId, targetId),
    ]);

    const data = loadRecords();
    const groupKey = String(groupId);
    const targetKey = String(targetId);
    if (!data[groupKey]) data[groupKey] = {};
    if (!data[groupKey][targetKey]) data[groupKey][targetKey] = { count: 0, records: [] };

    data[groupKey][targetKey].records.push({
        operator_id: operatorId,
        operator_name: operatorName,
        message: messageText,
        timestamp: Math.floor(Date.now() / 1000),
    });
    data[groupKey][targetKey].count = data[groupKey][targetKey].records.length;
    saveRecords(data);

    const params = getFeatureSettings(groupId, 'recall_stats').params;
    const thresholds = paramNumberList(params, 'thresholds', [3, 5]);
    const count = data[groupKey][targetKey].count;
    const maxThreshold = Math.max(...thresholds, 5);
    const shouldWarn = thresholds.includes(count) || count > maxThreshold;

    logDebug(`[群管助手] 撤回记录 group=${groupId} target=${targetId} count=${count}`);

    if (!shouldWarn) return;

    const template = paramString(params, 'warning_text', DEFAULT_WARNING);
    await sendGroup(groupId, [at(targetId), text(` ${template.replace('{count}', String(count))}`)]);
});

/* ---------------- 命令 ---------------- */

registerCommand({
    name: 'recall',
    feature: 'recall_stats',
    block: true,
    permission: 'none',
    description: 'recall open / recall close（群聊）；私聊 recall 群号 QQ号 — 查询被撤回记录',
    handler: async (c) => {
        const isGroup = c.groupId > 0;

        /* ---- 群聊：开关 ---- */
        if (isGroup) {
            if (!canToggle(c.groupId, c.userId, c.role, 'recall_stats')) {
                await sendGroup(c.groupId, MESSAGES.noPermission);
                return;
            }

            const arg = (c.argv[0] ?? '').toLowerCase();
            const enabled = getFeatureSettings(c.groupId, 'recall_stats').enabled;

            if (arg === 'open') {
                if (enabled) {
                    await sendGroup(c.groupId, '当前群的撤回消息统计已经是开启状态');
                    return;
                }
                setFeatureEnabled(c.groupId, 'recall_stats', true);
                await sendGroup(c.groupId, `已开启群 ${c.groupId} 的撤回消息统计`);
                return;
            }

            if (arg === 'close') {
                if (!enabled) {
                    await sendGroup(c.groupId, '当前群的撤回消息统计已经是关闭状态');
                    return;
                }
                setFeatureEnabled(c.groupId, 'recall_stats', false);
                await sendGroup(c.groupId, `已关闭群 ${c.groupId} 的撤回消息统计`);
                return;
            }

            await sendGroup(c.groupId, '群聊用法：recall open 或 recall close');
            return;
        }

        /* ---- 私聊：查询 ---- */
        if (c.argv.length < 2) {
            await sendPrivate(c.userId, '私聊用法：recall <群号> <QQ号>\n例如：recall 123456789 987654321');
            return;
        }

        const groupId = Number(c.argv[0]);
        const targetId = Number(c.argv[1]);
        if (!Number.isFinite(groupId) || !Number.isFinite(targetId)) {
            await sendPrivate(c.userId, '群号或 QQ 号格式错误，请输入数字');
            return;
        }

        // 权限：Bot 管理员 或 该群群主/管理员
        if (!isGlobalAdmin(c.userId)) {
            let role = 'member';
            try {
                const info = await callAction<{ role?: string }>('get_group_member_info', {
                    group_id: String(groupId),
                    user_id: String(c.userId),
                    no_cache: false,
                });
                role = info?.role ?? 'member';
            } catch {
                await sendPrivate(c.userId, '无法验证你的群成员身份，请确认群号正确且你是该群管理员');
                return;
            }
            if (role !== 'owner' && role !== 'admin') {
                await sendPrivate(c.userId, '你没有权限执行此操作（仅该群群主、群管理或 Bot 主人可用）');
                return;
            }
        }

        if (!getFeatureSettings(groupId, 'recall_stats').enabled) {
            await sendPrivate(c.userId, '该群未开启撤回消息统计，请先在群内使用 recall open 开启');
            return;
        }

        const data = loadRecords();
        const userData = getUserRecords(data, groupId, targetId);
        if (!userData || !userData.count) {
            await sendPrivate(c.userId, `用户 ${targetId} 在群 ${groupId} 没有被撤回的记录`);
            return;
        }

        const targetName = await fetchMemberName(groupId, targetId);
        const lines = userData.records.map((r, i) => {
            const content = r.message.length > 300 ? `${r.message.slice(0, 300)}...` : r.message;
            return `#${i + 1} 撤回人：${r.operator_name}\n消息内容：${content}`;
        });

        try {
            await sendForward({
                userId: c.userId,
                title: `${targetName} (${targetId}) 在群 ${groupId} 的被撤回记录（共 ${userData.count} 条）`,
                lines,
            });
        } catch (e) {
            logError('[群管助手] 发送撤回记录失败:', e);
            await sendPrivate(
                c.userId,
                `📋 ${targetName} (${targetId}) 在群 ${groupId} 的被撤回记录（共 ${userData.count} 条）\n\n${lines.join('\n\n')}`,
            );
        }
    },
});

export { FORWARD_NICKNAME };

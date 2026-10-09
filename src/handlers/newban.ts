/**
 * 新人禁言（对应 nonebot/newban.py）
 *
 * - 新人入群：按本群配置的时长禁言，并发送通知文案（支持 {time} 与 {image=...}）
 * - 退群重进：若退群前仍处于禁言状态，按原时长重新禁言并发送警示文案
 * - 群内开关：newban open / newban close
 */

import { DEFAULT_NEWBAN_REMUTE, DEFAULT_NEWBAN_WELCOME } from '../constants';
import { getPendingBan, removeBanRecord } from '../core/ban-records';
import { registerNotice } from '../core/events';
import { at, callAction, renderTemplate, sendGroup } from '../core/messages';
import { canToggle } from '../core/permission';
import { getFeatureSettings, setFeatureEnabled } from '../core/profiles';
import { registerCommand } from '../core/router';
import { logDebug, logError, logWarn } from '../core/state';
import { formatDuration, paramNumber, paramString } from '../core/utils';

registerNotice('group_increase', 'newban', async (ctx) => {
    const { groupId, userId } = ctx;
    if (!groupId || !userId) return;

    const params = getFeatureSettings(groupId, 'newban').params;
    const banDuration = Math.max(0, Math.floor(paramNumber(params, 'ban_duration', 180)));
    const welcomeText = paramString(params, 'welcome_text', DEFAULT_NEWBAN_WELCOME);
    const remuteText = paramString(params, 'remute_text', DEFAULT_NEWBAN_REMUTE);

    // 退群重进（有未过期禁言记录）→ 按原时长重禁；否则按新人时长禁言
    const pending = getPendingBan(groupId, userId);
    const remute = pending !== null;
    const duration = remute ? Math.max(0, Math.floor(Number(pending?.duration) || 0)) : banDuration;
    const timeStr = formatDuration(duration);

    // 1) 禁言（与文案分开 try，任何一步失败都能在日志里看出是哪一步）
    try {
        await callAction('set_group_ban', {
            group_id: String(groupId),
            user_id: String(userId),
            duration,
        });
        logDebug(
            `[群管助手] ${remute ? '退群重进重禁' : '新人禁言'} group=${groupId} user=${userId} duration=${duration}`,
        );
    } catch (e) {
        logError(`[群管助手] 禁言失败 group=${groupId} user=${userId} duration=${duration}:`, e);
    }

    // 2) 文案（支持 {time} 与 {image=...}）
    try {
        const segments = [at(userId), ...renderTemplate(remute ? remuteText : welcomeText, { time: timeStr })];
        // 除 @ 外没有实质内容时（例如 {image=...} 没解析到图片）退回默认文案，
        // 否则会发出一条只有 @ 的空消息，被协议端拒收，表现就是「文案没发出来」
        const hasBody = segments.some(
            (s) => s.type !== 'at' && (s.type !== 'text' || String(s.data?.text ?? '').trim() !== ''),
        );
        if (!hasBody) {
            logWarn(
                `[群管助手] 入群文案没有可发送内容（检查 {image=...} 是否指向真实存在的图片），已回退默认文案 group=${groupId}`,
            );
            segments.push(...renderTemplate(remute ? DEFAULT_NEWBAN_REMUTE : DEFAULT_NEWBAN_WELCOME, { time: timeStr }));
        }
        logDebug(`[群管助手] 发送入群文案 group=${groupId} user=${userId} 消息段数=${segments.length}`);
        await sendGroup(groupId, segments);
    } catch (e) {
        logError(`[群管助手] 入群文案发送失败 group=${groupId} user=${userId}:`, e);
    }

    if (remute) removeBanRecord(groupId, userId);
});

registerCommand({
    name: 'newban',
    feature: 'newban',
    block: true,
    permission: 'toggle',
    description: 'newban open / newban close — 开启或关闭本群新人禁言',
    handler: async (c) => {
        const arg = (c.argv[0] ?? '').toLowerCase();
        const current = getFeatureSettings(c.groupId, 'newban').enabled;

        if (arg === 'open') {
            if (current) {
                await sendGroup(c.groupId, '当前群的新人禁言已经是开启状态');
                return;
            }
            setFeatureEnabled(c.groupId, 'newban', true);
            await sendGroup(c.groupId, `已开启群 ${c.groupId} 的新人禁言`);
            return;
        }

        if (arg === 'close') {
            if (!current) {
                await sendGroup(c.groupId, '当前群的新人禁言已经是关闭状态');
                return;
            }
            setFeatureEnabled(c.groupId, 'newban', false);
            await sendGroup(c.groupId, `已关闭群 ${c.groupId} 的新人禁言`);
            return;
        }

        await sendGroup(c.groupId, '用法：newban open 或 newban close');
    },
});

/** 该群是否允许群主/管理员控制开关（供配置说明展示，实际判定在 router 里） */
export function canToggleNewban(groupId: number, userId: number, role: string): boolean {
    return canToggle(groupId, userId, role, 'newban');
}

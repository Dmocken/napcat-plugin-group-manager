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
import { logDebug, logError } from '../core/state';
import { formatDuration, paramNumber, paramString } from '../core/utils';

registerNotice('group_increase', 'newban', async (ctx) => {
    const { groupId, userId } = ctx;
    if (!groupId || !userId) return;

    const params = getFeatureSettings(groupId, 'newban').params;
    const banDuration = Math.max(0, Math.floor(paramNumber(params, 'ban_duration', 180)));
    const welcomeText = paramString(params, 'welcome_text', DEFAULT_NEWBAN_WELCOME);
    const remuteText = paramString(params, 'remute_text', DEFAULT_NEWBAN_REMUTE);

    try {
        const pending = getPendingBan(groupId, userId);

        if (pending) {
            // 退群重进：重新施加原禁言时长
            const original = Math.max(0, Math.floor(Number(pending.duration) || 0));
            await callAction('set_group_ban', {
                group_id: String(groupId),
                user_id: String(userId),
                duration: original,
            });
            removeBanRecord(groupId, userId);

            const timeStr = formatDuration(original);
            const segments = [at(userId), ...renderTemplate(remuteText, { time: timeStr })];
            logDebug(`[群管助手] 退群重进重禁 group=${groupId} user=${userId} duration=${original}`);
            await sendGroup(groupId, segments);
            return;
        }

        await callAction('set_group_ban', {
            group_id: String(groupId),
            user_id: String(userId),
            duration: banDuration,
        });

        const timeStr = formatDuration(banDuration);
        const segments = [at(userId), ...renderTemplate(welcomeText, { time: timeStr })];
        logDebug(`[群管助手] 新人禁言 group=${groupId} user=${userId} duration=${banDuration}`);
        await sendGroup(groupId, segments);
    } catch (e) {
        logError('[群管助手] 新人入群处理失败:', e);
    }
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

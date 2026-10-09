/**
 * 手动禁言 / 踢人 / 解禁 / 撤回（对应 nonebot/ban.py）
 *
 * 命令：ban @用户 时长 单位（秒/分/时/天）、kick @用户、unban @用户、撤回消息（引用）
 * 事件：group_ban（写入/清除禁言记录 + 禁言成功回执）、group_decrease（踢人保护）
 */

import { addBanRecord, cleanExpiredBanRecords, removeBanRecord } from '../core/ban-records';
import { registerNotice } from '../core/events';
import { callAction, replyIdOf, sendGroup } from '../core/messages';
import { isGlobalAdmin } from '../core/permission';
import { registerCommand } from '../core/router';
import { logDebug, logError } from '../core/state';
import { schedule } from '../core/timers';
import { parseDuration } from '../core/utils';

/** 等待 group_ban 通知回执的禁言操作：`group_user` → 原始时长输入 */
const pendingBans = new Map<string, { timeStr: string; unitStr: string }>();

const banKey = (groupId: number, userId: string | number) => `${groupId}_${userId}`;

registerCommand({
    name: 'ban',
    feature: 'ban',
    description: 'ban @用户 时长 单位（秒/分/时/天）— 禁言指定成员',
    handler: async (c) => {
        const target = c.atTargets[0];
        if (!target) {
            await sendGroup(c.groupId, '你要把谁关进小黑屋？');
            return;
        }

        const [timeStr, unitStr] = c.argv;
        if (!timeStr || !unitStr) {
            await sendGroup(c.groupId, '格式错误！正确格式：ban @用户 时长 单位（秒/分/时/天），中间都有空格哦');
            return;
        }

        const duration = parseDuration(timeStr, unitStr);
        if (!duration) {
            await sendGroup(c.groupId, '格式输错啦！正确格式：ban @用户 时长 单位（秒/分/时/天），中间都有空格哦');
            return;
        }

        const key = banKey(c.groupId, target);
        pendingBans.set(key, { timeStr, unitStr });

        try {
            await callAction('set_group_ban', {
                group_id: String(c.groupId),
                user_id: String(target),
                duration,
            });

            // 5 秒内没有收到禁言通知 → 判定为操作可能失败
            schedule(5000, async () => {
                if (!pendingBans.has(key)) return;
                pendingBans.delete(key);
                await sendGroup(c.groupId, '禁言操作可能失败，请检查机器人权限');
            });
        } catch (e) {
            pendingBans.delete(key);
            logError('[群管助手] 禁言失败:', e);
            await sendGroup(c.groupId, `禁言失败：${String(e)}`);
        }
    },
});

registerCommand({
    name: 'kick',
    feature: 'ban',
    description: 'kick @用户 — 将成员移出本群',
    handler: async (c) => {
        const target = c.atTargets[0];
        if (!target) {
            await sendGroup(c.groupId, '你要踢谁？');
            return;
        }

        try {
            await callAction('set_group_kick', {
                group_id: String(c.groupId),
                user_id: String(target),
                reject_add_request: false,
            });
        } catch (e) {
            logError('[群管助手] 踢人失败:', e);
            await sendGroup(c.groupId, `踢人失败：${String(e)}`);
            return;
        }

        schedule(1000, async () => {
            await sendGroup(c.groupId, `${target} 消失啦~`);
        });
    },
});

registerCommand({
    name: 'unban',
    feature: 'ban',
    description: 'unban @用户 — 解除禁言',
    handler: async (c) => {
        const target = c.atTargets[0];
        if (!target) {
            await sendGroup(c.groupId, '你想把谁放出小黑屋？');
            return;
        }

        try {
            await callAction('set_group_ban', {
                group_id: String(c.groupId),
                user_id: String(target),
                duration: 0,
            });
            removeBanRecord(c.groupId, target);
            await sendGroup(c.groupId, `已将 ${target} 放出小黑屋`);
        } catch (e) {
            logError('[群管助手] 解除禁言失败:', e);
            await sendGroup(c.groupId, `解禁失败：${String(e)}`);
        }
    },
});

registerCommand({
    name: '撤回消息',
    feature: 'ban',
    description: '撤回消息 — 引用一条消息把它撤回',
    handler: async (c) => {
        const replyId = replyIdOf(c.event);
        if (!replyId) {
            await sendGroup(c.groupId, '你要撤回哪条消息？');
            return;
        }

        try {
            await callAction('delete_msg', { message_id: replyId });
        } catch (e) {
            logError('[群管助手] 撤回消息失败:', e);
            await sendGroup(c.groupId, `撤回失败：${String(e)}`);
        }
    },
});

/* ---------------- 事件 ---------------- */

/** 禁言记录：任何群都要记录（新人禁言的「退群重进重禁」依赖它），因此不受功能开关限制 */
registerNotice('group_ban', null, async (ctx) => {
    if (ctx.event.duration && ctx.event.duration > 0) {
        addBanRecord(ctx.groupId, ctx.userId, ctx.event.duration);
    } else {
        removeBanRecord(ctx.groupId, ctx.userId);
    }

    cleanExpiredBanRecords();

    const key = banKey(ctx.groupId, ctx.userId);
    const pending = pendingBans.get(key);
    if (pending && ctx.event.duration && ctx.event.duration > 0) {
        pendingBans.delete(key);
        logDebug(`[群管助手] 禁言回执 group=${ctx.groupId} user=${ctx.userId}`);
        await sendGroup(
            ctx.groupId,
            `已成功把用户 ${ctx.userId} 禁言${pending.timeStr}${pending.unitStr}`,
        );
    }
});

/** 踢人保护：踢人者与被踢者都是 Bot 管理员时吐槽一句 */
registerNotice('group_decrease', null, async (ctx) => {
    if (ctx.event.sub_type !== 'kick') return;
    if (ctx.operatorId === ctx.userId) return;
    if (!ctx.operatorId) return;

    if (isGlobalAdmin(ctx.operatorId) && isGlobalAdmin(ctx.userId)) {
        await sendGroup(ctx.groupId, '铸币你要不看看你在踢谁？');
    }
});

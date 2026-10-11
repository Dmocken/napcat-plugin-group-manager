/**
 * 手动禁言 / 踢人 / 解禁 / 撤回（对应 nonebot/ban.py）
 *
 * 命令：ban @用户 时长 单位（秒/分/时/天）、kick @用户、unban @用户、撤回（引用）
 * 事件：group_ban（写入/清除禁言记录 + 禁言成功回执）、
 *       group_decrease（退群标记 + 踢人回执 + 踢人保护）
 *
 * 所有提示文案都可以在 WebUI 的「手动禁言 / 踢人 / 解禁 / 撤回 → 提示文案」里改。
 */

import { currentActivity, withActivity, type ActivityHandle } from '../core/activity';
import {
    addBanRecord,
    cleanExpiredBanRecords,
    consumeNoRemuteBan,
    removeBanRecord,
    setBanRecordLeft,
    setBanRecordName,
} from '../core/ban-records';
import { registerNotice } from '../core/events';
import { callAction, replyIdOf, sendGroup } from '../core/messages';
import { resolveNickname } from '../core/nicknames';
import { isGlobalAdmin } from '../core/permission';
import { getFeatureSettings } from '../core/profiles';
import { registerCommand } from '../core/router';
import { logDebug, logError } from '../core/state';
import { paramText } from '../core/texts';
import { schedule } from '../core/timers';
import { parseDuration } from '../core/utils';

/**
 * 等待 group_ban 通知回执的禁言操作：`group_user` → 原始时长输入。
 *
 * set_group_ban 属操作型接口，NapCat 成功 / 失败都只抛「No data returned」，
 * 无法从返回值判断，因此以禁言通知为准，activity 用于把延迟回执算进那条调用日志。
 */
const pendingBans = new Map<
    string,
    { timeStr: string; unitStr: string; activity: ActivityHandle | null }
>();

/** 同上，等待 group_decrease 通知回执的踢人操作（群主 / 管理员被踢时不会推送） */
const pendingKicks = new Map<string, ActivityHandle | null>();

/** 通知回执等待时长（毫秒），等不到即判定为失败 */
const CONFIRM_TIMEOUT = 5000;

const banKey = (groupId: number, userId: string | number) => `${groupId}_${userId}`;

const banParams = (groupId: number) => getFeatureSettings(groupId, 'ban').params;

registerCommand({
    name: 'ban',
    feature: 'ban',
    description: 'ban @用户 时长 单位（秒/分/时/天）— 禁言指定成员',
    handler: async (c) => {
        const params = banParams(c.groupId);
        const target = c.atTargets[0];
        if (!target) {
            await sendGroup(c.groupId, paramText(params, 'ban_no_target', '你要把谁关进小黑屋？'));
            return;
        }

        const [timeStr, unitStr] = c.argv;
        if (!timeStr || !unitStr) {
            await sendGroup(
                c.groupId,
                paramText(
                    params,
                    'ban_bad_format',
                    '格式错误！正确格式：ban @用户 时长 单位（秒/分/时/天），中间都有空格哦',
                ),
            );
            return;
        }

        const duration = parseDuration(timeStr, unitStr);
        if (!duration) {
            await sendGroup(
                c.groupId,
                paramText(
                    params,
                    'ban_bad_duration',
                    '格式输错啦！正确格式：ban @用户 时长 单位（秒/分/时/天），中间都有空格哦',
                ),
            );
            return;
        }

        // 结果要等 group_ban 通知才知道，这条调用日志交给回执 / 超时来收尾
        const activity = currentActivity();
        activity?.hold();
        const key = banKey(c.groupId, target);
        pendingBans.set(key, { timeStr, unitStr, activity });

        try {
            await callAction('set_group_ban', {
                group_id: String(c.groupId),
                user_id: String(target),
                duration,
            });
        } catch (e) {
            pendingBans.delete(key);
            logError('[群管助手] 禁言失败:', e);
            const text = paramText(params, 'ban_failed', '禁言失败：{error}', { error: String(e) });
            await withActivity(activity, () => sendGroup(c.groupId, text));
            activity?.settle('fail', e instanceof Error ? e.message : String(e));
            return;
        }

        // 超时仍没收到禁言通知 → 判定为操作可能失败
        schedule(CONFIRM_TIMEOUT, async () => {
            if (!pendingBans.has(key)) return;
            const entry = pendingBans.get(key);
            pendingBans.delete(key);
            logDebug(`[群管助手] 禁言无回执 group=${c.groupId} user=${target}`);
            const text = paramText(params, 'ban_maybe_failed', '禁言操作可能失败，请检查机器人权限');
            await withActivity(entry?.activity, () => sendGroup(c.groupId, text));
            entry?.activity?.settle('fail', '未收到禁言通知，可能没有权限');
        });
    },
});

registerCommand({
    name: 'kick',
    feature: 'ban',
    description: 'kick @用户 — 将成员移出本群',
    handler: async (c) => {
        const params = banParams(c.groupId);
        const target = c.atTargets[0];
        if (!target) {
            await sendGroup(c.groupId, paramText(params, 'kick_no_target', '你要踢谁？'));
            return;
        }

        // 结果要等 group_decrease 通知才知道，这条调用日志交给回执 / 超时来收尾
        const activity = currentActivity();
        activity?.hold();
        const key = banKey(c.groupId, target);
        pendingKicks.set(key, activity);

        try {
            await callAction('set_group_kick', {
                group_id: String(c.groupId),
                user_id: String(target),
                reject_add_request: false,
            });
        } catch (e) {
            pendingKicks.delete(key);
            logError('[群管助手] 踢人失败:', e);
            const text = paramText(params, 'kick_failed', '踢人失败：{error}', { error: String(e) });
            await withActivity(activity, () => sendGroup(c.groupId, text));
            activity?.settle('fail', e instanceof Error ? e.message : String(e));
            return;
        }

        // 等不到踢人通知 → 判定失败（群主 / 管理员踢不动，或机器人权限不足）
        schedule(CONFIRM_TIMEOUT, async () => {
            if (!pendingKicks.has(key)) return;
            const entry = pendingKicks.get(key);
            pendingKicks.delete(key);
            logDebug(`[群管助手] 踢人无回执 group=${c.groupId} user=${target}`);
            const text = paramText(
                params,
                'kick_maybe_failed',
                '踢人失败：{user} 可能是群主 / 管理员，或机器人没有权限',
                { user: target },
            );
            await withActivity(entry, () => sendGroup(c.groupId, text));
            entry?.settle('fail', '未收到踢人通知，可能没有权限');
        });
    },
});

registerCommand({
    name: 'unban',
    feature: 'ban',
    description: 'unban @用户 — 解除禁言',
    handler: async (c) => {
        const params = banParams(c.groupId);
        const target = c.atTargets[0];
        if (!target) {
            await sendGroup(c.groupId, paramText(params, 'unban_no_target', '你想把谁放出小黑屋？'));
            return;
        }

        try {
            await callAction('set_group_ban', {
                group_id: String(c.groupId),
                user_id: String(target),
                duration: 0,
            });
            removeBanRecord(c.groupId, target);
            await sendGroup(
                c.groupId,
                paramText(params, 'unban_success', '已将 {user} 放出小黑屋', { user: target }),
            );
        } catch (e) {
            logError('[群管助手] 解除禁言失败:', e);
            await sendGroup(
                c.groupId,
                paramText(params, 'unban_failed', '解禁失败：{error}', { error: String(e) }),
            );
        }
    },
});

registerCommand({
    name: '撤回',
    // 兼容旧命令名
    aliases: ['撤回消息'],
    feature: 'ban',
    description: '撤回 — 引用一条消息把它撤回',
    handler: async (c) => {
        const params = banParams(c.groupId);
        const replyId = replyIdOf(c.event);
        if (!replyId) {
            await sendGroup(
                c.groupId,
                paramText(
                    params,
                    'recall_no_target',
                    '你要撤回哪条消息？引用一条消息后发送「撤回」即可',
                ),
            );
            return;
        }

        try {
            await callAction('delete_msg', { message_id: replyId });
        } catch (e) {
            logError('[群管助手] 撤回失败:', e);
            await sendGroup(
                c.groupId,
                paramText(params, 'recall_failed', '撤回失败：{error}', { error: String(e) }),
            );
        }
    },
});

/* ---------------- 事件 ---------------- */

/** 禁言记录：任何群都要记录（新人禁言的「退群重进重禁」依赖它），因此不受功能开关限制 */
registerNotice('group_ban', null, async (ctx) => {
    if (ctx.event.duration && ctx.event.duration > 0) {
        // sm / smplus 打的标记：这类禁言不参与「退群重进重新禁言」
        // （标记带预期时长，只有时长对得上的通知才消费它）
        const remute = !consumeNoRemuteBan(ctx.groupId, ctx.userId, ctx.event.duration);
        addBanRecord(ctx.groupId, ctx.userId, ctx.event.duration, { remute });

        // 通知事件只带 QQ 号，昵称要反查（有缓存与超时保护）。
        // 不 await：记录先落盘，查到名字再补写，免得接口慢的时候拖住事件处理。
        void resolveNickname(ctx.groupId, ctx.userId).then((name) => {
            if (name) setBanRecordName(ctx.groupId, ctx.userId, name);
        });
    } else {
        removeBanRecord(ctx.groupId, ctx.userId);
    }

    cleanExpiredBanRecords();

    const key = banKey(ctx.groupId, ctx.userId);
    const pending = pendingBans.get(key);
    if (pending && ctx.event.duration && ctx.event.duration > 0) {
        pendingBans.delete(key);
        logDebug(`[群管助手] 禁言回执 group=${ctx.groupId} user=${ctx.userId}`);
        const text = paramText(
            banParams(ctx.groupId),
            'ban_success',
            '已成功把用户 {user} 禁言{time}',
            { user: ctx.userId, time: `${pending.timeStr}${pending.unitStr}` },
        );
        await withActivity(pending.activity, () => sendGroup(ctx.groupId, text));
        pending.activity?.settle('ok');
    }
});

/**
 * 退群标记：退群 / 被踢时给禁言记录打上 `left = true`。
 *
 * 「退群重进重新禁言」据此判断这个人是不是真的走了（也决定 WebUI 里「是否退群」那一列），
 * 因此任何群都要记录，不受功能开关限制。
 */
registerNotice('group_decrease', null, async (ctx) => {
    if (!ctx.groupId || !ctx.userId) return;
    if (setBanRecordLeft(ctx.groupId, ctx.userId, true)) {
        logDebug(`[群管助手] 标记退群 group=${ctx.groupId} user=${ctx.userId}`);
    }
});

/** 踢人回执：收到 group_decrease(kick) 才说明真踢出去了，此时回复成功文案 */
registerNotice('group_decrease', null, async (ctx) => {
    if (ctx.event.sub_type !== 'kick') return;
    const key = banKey(ctx.groupId, ctx.userId);
    if (!pendingKicks.has(key)) return;
    const activity = pendingKicks.get(key);
    pendingKicks.delete(key);

    logDebug(`[群管助手] 踢人回执 group=${ctx.groupId} user=${ctx.userId}`);
    const text = paramText(banParams(ctx.groupId), 'kick_success', '{user} 消失啦~', {
        user: ctx.userId,
    });
    await withActivity(activity, () => sendGroup(ctx.groupId, text));
    activity?.settle('ok');
});

/** 踢人保护：踢人者与被踢者都是 Bot 管理员时吐槽一句 */
registerNotice('group_decrease', null, async (ctx) => {
    if (ctx.event.sub_type !== 'kick') return;
    if (ctx.operatorId === ctx.userId) return;
    if (!ctx.operatorId) return;

    if (isGlobalAdmin(ctx.operatorId) && isGlobalAdmin(ctx.userId)) {
        await sendGroup(
            ctx.groupId,
            paramText(banParams(ctx.groupId), 'kick_admin_warn', '铸币你要不看看你在踢谁？'),
        );
    }
});

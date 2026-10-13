/**
 * 随机禁言（对应 nonebot/random_ban.py）
 *
 * 裸命令（不带前缀）：sm、smplus
 *   - 有权限：sm @用户 / smplus @用户 → 对每个被 @ 的人随机禁言
 *   - 无权限：sm / smplus → 禁言自己
 *   - sm list / smplus list → 被禁言时长排行（所有人可用，见「禁言时长统计」功能）
 * Bot 管理员不会被 sm。
 *
 * 统计的写入在 handlers/ban.ts 的 group_ban 通知里（禁言真的生效后才计数）。
 * 提示文案可在 WebUI 的「随机禁言 / 禁言时长统计 → 提示文案」里改。
 */

import type { CommandContext } from '../types';
import {
    DEFAULT_SM_STATS_EMPTY,
    DEFAULT_SM_STATS_LINE,
    DEFAULT_SM_STATS_TITLE,
} from '../constants';
import { clearNoRemuteBan, markNoRemuteBan } from '../core/ban-records';
import { callAction, sendGroup } from '../core/messages';
import { checkFeatureAccess, isGlobalAdmin } from '../core/permission';
import { registerCommand } from '../core/router';
import { topSmMuted } from '../core/sm-stats';
import { logError } from '../core/state';
import { paramText } from '../core/texts';
import {
    formatClock,
    formatDurationExact,
    formatTime,
    paramNumber,
    randomInt,
} from '../core/utils';

/** 随机禁言并对群里播报 */
async function banUser(
    c: CommandContext,
    params: Record<string, unknown>,
    targetId: string,
    min: number,
    max: number,
): Promise<void> {
    const muteSeconds = randomInt(min, max);
    // 娱乐向禁言：退群重进后不按原时长重新禁言（标记由 group_ban 通知取用）
    markNoRemuteBan(c.groupId, targetId, muteSeconds);
    try {
        await callAction('set_group_ban', {
            group_id: String(c.groupId),
            user_id: String(targetId),
            duration: muteSeconds,
        });

        const endTime = new Date(Date.now() + muteSeconds * 1000);
        await sendGroup(
            c.groupId,
            paramText(
                params,
                'sm_success',
                '已将小杂鱼{user}随机禁言{seconds}秒♥\n乖乖呆在我的小黑屋里面到 {clock}吧！',
                { user: targetId, seconds: muteSeconds, clock: formatClock(endTime) },
            ),
        );
    } catch (e) {
        clearNoRemuteBan(c.groupId, targetId);
        logError('[群管助手] 随机禁言失败:', e);
        await sendGroup(
            c.groupId,
            paramText(params, 'sm_failed', '禁言失败，你不会认真一点吗？ {error}', { error: String(e) }),
        );
    }
}

/**
 * sm list / smplus list：被禁言时长排行。
 *
 * 权限与 sm 本身无关，所有群成员都能查；但要该群在后台开了「禁言时长统计」才回应，
 * 没开就静默（与 sm 未启用时的行为一致）。数据是跨群累计的，不含群 / 配置组维度。
 */
async function sendSmStatsList(c: CommandContext): Promise<void> {
    const access = checkFeatureAccess(c.groupId, c.userId, c.role, 'sm_stats');
    if (!access.enabled) return;

    const params = access.settings.params;
    const limit = Math.max(1, Math.floor(paramNumber(params, 'top', 10)));
    const rows = topSmMuted(limit);

    const lines = [paramText(params, 'sm_stats_title', DEFAULT_SM_STATS_TITLE, { limit })];
    if (!rows.length) {
        lines.push(paramText(params, 'sm_stats_empty', DEFAULT_SM_STATS_EMPTY));
    }
    rows.forEach((row, index) => {
        lines.push(
            paramText(params, 'sm_stats_line', DEFAULT_SM_STATS_LINE, {
                rank: index + 1,
                user: row.userId,
                duration: formatDurationExact(row.longest),
                seconds: row.longest,
                clock: formatTime(row.longestAt),
                total: formatDurationExact(row.total),
                count: row.count,
            }),
        );
    });

    await sendGroup(c.groupId, lines.join('\n'));
}

async function handleRandomBan(c: CommandContext, plus: boolean): Promise<void> {
    if (!c.groupId) return;

    // sm list / smplus list：查排行（这条要排在随机禁言之前，别把它当成禁言目标）
    if ((c.argv[0] ?? '').toLowerCase() === 'list') {
        await sendSmStatsList(c);
        return;
    }

    const access = checkFeatureAccess(c.groupId, c.userId, c.role, 'random_ban');
    // 该群未启用随机禁言 → 静默（与旧版一致）
    if (!access.enabled) return;

    const params = access.settings.params;
    const min = plus ? paramNumber(params, 'smplus_min', 1) : paramNumber(params, 'sm_min', 1);
    const max = plus ? paramNumber(params, 'smplus_max', 28800) : paramNumber(params, 'sm_max', 3600);

    // 无权限：只有裸命令（不含 @）时才禁言自己
    if (!access.hasPermission) {
        if (c.plainText.trim().toLowerCase() === c.command) {
            await banUser(c, params, String(c.userId), min, max);
        }
        return;
    }

    if (!c.atTargets.length) {
        await sendGroup(c.groupId, paramText(params, 'sm_no_target', '请@要禁言的用户'));
        return;
    }

    for (const target of c.atTargets) {
        if (isGlobalAdmin(target)) {
            await sendGroup(c.groupId, paramText(params, 'sm_admin_deny', 'sm谁？你sm一个试试看？'));
            continue;
        }
        await banUser(c, params, target, min, max);
    }
}

registerCommand({
    name: 'sm',
    feature: 'random_ban',
    prefixRequired: false,
    block: true,
    permission: 'none',
    description: 'sm [@用户] — 随机禁言（无权限时会禁言自己）；sm list 查看禁言时长排行',
    handler: (c) => handleRandomBan(c, false),
});

registerCommand({
    name: 'smplus',
    feature: 'random_ban',
    prefixRequired: false,
    block: true,
    permission: 'none',
    description:
        'smplus [@用户] — 随机禁言（时长更长，无权限时会禁言自己）；smplus list 查看禁言时长排行',
    handler: (c) => handleRandomBan(c, true),
});

/**
 * 随机禁言（对应 nonebot/random_ban.py）
 *
 * 裸命令（不带前缀）：sm、smplus
 *   - 有权限：sm @用户 / smplus @用户 → 对每个被 @ 的人随机禁言
 *   - 无权限：sm / smplus → 禁言自己
 * Bot 管理员不会被 sm。
 */

import type { CommandContext } from '../types';
import { callAction, sendGroup } from '../core/messages';
import { checkFeatureAccess, isGlobalAdmin } from '../core/permission';
import { registerCommand } from '../core/router';
import { logError } from '../core/state';
import { formatClock, paramNumber, randomInt } from '../core/utils';

/** 随机禁言并对群里播报 */
async function banUser(c: CommandContext, targetId: string, min: number, max: number): Promise<void> {
    const muteSeconds = randomInt(min, max);
    try {
        await callAction('set_group_ban', {
            group_id: String(c.groupId),
            user_id: String(targetId),
            duration: muteSeconds,
        });

        const endTime = new Date(Date.now() + muteSeconds * 1000);
        await sendGroup(
            c.groupId,
            `已将小杂鱼${targetId}随机禁言${muteSeconds}秒♥\n` +
                `乖乖呆在我的小黑屋里面到 ${formatClock(endTime)}吧！`,
        );
    } catch (e) {
        logError('[群管助手] 随机禁言失败:', e);
        await sendGroup(c.groupId, `禁言失败，你不会认真一点吗？ ${String(e)}`);
    }
}

async function handleRandomBan(c: CommandContext, plus: boolean): Promise<void> {
    if (!c.groupId) return;

    const access = checkFeatureAccess(c.groupId, c.userId, c.role, 'random_ban');
    // 该群未启用随机禁言 → 静默（与旧版一致）
    if (!access.enabled) return;

    const params = access.settings.params;
    const min = plus ? paramNumber(params, 'smplus_min', 1) : paramNumber(params, 'sm_min', 1);
    const max = plus ? paramNumber(params, 'smplus_max', 28800) : paramNumber(params, 'sm_max', 3600);

    // 无权限：只有裸命令（不含 @）时才禁言自己
    if (!access.hasPermission) {
        if (c.plainText.trim().toLowerCase() === c.command) {
            await banUser(c, String(c.userId), min, max);
        }
        return;
    }

    if (!c.atTargets.length) {
        await sendGroup(c.groupId, '请@要禁言的用户');
        return;
    }

    for (const target of c.atTargets) {
        if (isGlobalAdmin(target)) {
            await sendGroup(c.groupId, 'sm谁？你sm一个试试看？');
            continue;
        }
        await banUser(c, target, min, max);
    }
}

registerCommand({
    name: 'sm',
    feature: 'random_ban',
    prefixRequired: false,
    block: true,
    permission: 'none',
    description: 'sm [@用户] — 随机禁言（无权限时会禁言自己）',
    handler: (c) => handleRandomBan(c, false),
});

registerCommand({
    name: 'smplus',
    feature: 'random_ban',
    prefixRequired: false,
    block: true,
    permission: 'none',
    description: 'smplus [@用户] — 随机禁言（时长更长，无权限时会禁言自己）',
    handler: (c) => handleRandomBan(c, true),
});

/**
 * 拉黑（配置组级入群黑名单）
 *
 * 命令：black @用户 / black QQ号 [原因]、unblack @用户 / unblack QQ号
 * 事件：request/group（入群申请 / 邀请入群）—— 命中拉黑名单一律拒绝
 *
 * 与「黑历史」是两回事：黑历史只是留档展示，这里是真的拦入群。
 * 名单数据在 core/blacklist.ts（data/blacklist.json），WebUI「群数据 → 拉黑名单」可查可删。
 *
 * 提示文案可在 WebUI 的「拉黑 → 提示文案」里改。
 */

import type { CommandContext } from '../types';
import { addToBlacklist, isBlacklisted, removeFromBlacklist } from '../core/blacklist';
import { markRequestHandled, registerRequest } from '../core/events';
import { callAction, sendGroup } from '../core/messages';
import { resolveNickname } from '../core/nicknames';
import { findProfileByGroup, getFeatureSettings } from '../core/profiles';
import { registerCommand } from '../core/router';
import { logDebug, logError } from '../core/state';
import { paramText } from '../core/texts';
import { pickField } from '../core/utils';

/**
 * 拉黑 / 解除拉黑的公共部分：解析目标（@ 或 QQ 号）、定位配置组。
 *
 * 权限走命令的 permission: 'toggle'（见下方注册）：Bot 管理员永远可用，
 * 群主 / 管理员在功能开启时可用 —— 与 join / newban 的开关命令一致，
 * 避免「功能没开 → 谁也开不了」的死锁。
 */
async function handleBlacklistCommand(c: CommandContext, remove: boolean): Promise<void> {
    const params = getFeatureSettings(c.groupId, 'blacklist').params;
    const text = (key: string, def: string, vars: Record<string, string | number> = {}): string =>
        paramText(params, key, def, vars);

    // 目标是 @ 到的人，或者第一个参数里的 QQ 号
    const target = (c.atTargets[0] ?? c.argv[0] ?? '').trim();
    if (!target) {
        await sendGroup(c.groupId, text('blacklist_no_target', '要拉黑谁？@ 一下或直接给 QQ 号'));
        return;
    }
    if (!/^\d{5,12}$/.test(target)) {
        await sendGroup(c.groupId, text('blacklist_bad_id', '这 QQ 号格式不对啊！'));
        return;
    }

    const profile = findProfileByGroup(c.groupId);
    if (!profile) {
        await sendGroup(
            c.groupId,
            text('blacklist_no_profile', '本群还没有群配置，请先在 WebUI 的「群配置」里绑定'),
        );
        return;
    }

    // 昵称顺手反查一份存下来：被拉黑的人往往已经不在群里，
    // 之后再想显示名字就只能靠好友列表了（拿不到就只显示号码）
    const name = await resolveNickname(c.groupId, target);

    const vars = {
        user: target,
        who: name ? `${name}（${target}）` : target,
        profile: profile.label,
    };

    if (remove) {
        const ok = removeFromBlacklist(profile.id, target);
        await sendGroup(
            c.groupId,
            ok
                ? text('blacklist_removed', '已将 {who} 移出配置组「{profile}」的拉黑名单', vars)
                : text('blacklist_not_found', '{who} 不在配置组的拉黑名单里', vars),
        );
        return;
    }

    // 原因 = 目标之后剩下的文本（@ 的时候目标在 atTargets 里，不在 argv 里）
    const reason = c.argv.slice(1).join(' ').trim();
    const result = addToBlacklist(profile.id, target, c.userId, name, reason);

    await sendGroup(
        c.groupId,
        result === 'added'
            ? text(
                  'blacklist_added',
                  '已将 {who} 加入配置组「{profile}」的拉黑名单，入群申请一律拦截',
                  vars,
              )
            : text('blacklist_exists', '{who} 已经在配置组「{profile}」的拉黑名单里了', vars),
    );
}

registerCommand({
    name: 'black',
    feature: 'blacklist',
    permission: 'toggle',
    block: true,
    description: 'black @用户 / black QQ号 [原因] — 拉黑，拦截配置组内所有群的入群申请',
    handler: (c) => handleBlacklistCommand(c, false),
});

registerCommand({
    name: 'unblack',
    feature: 'blacklist',
    permission: 'toggle',
    block: true,
    description: 'unblack @用户 / unblack QQ号 — 解除拉黑',
    handler: (c) => handleBlacklistCommand(c, true),
});

/**
 * 入群申请拦截：主动加群（add）与邀请入群（invite）都拦。
 *
 * 注册的 feature 是 'blacklist'，所以只有该群开启了「拉黑」才会走到这里；
 * 拒绝后标记事件已处理，后面的加群审核会直接跳过，不会对同一个申请重复审批。
 */
registerRequest('group', 'blacklist', async (ctx) => {
    const event = ctx.event;
    const raw = event as unknown as Record<string, unknown>;

    const groupId = Number(pickField(raw, ['group_id', 'groupId', 'groupCode']) ?? ctx.groupId ?? 0);
    const userId = Number(pickField(raw, ['user_id', 'userId']) ?? ctx.userId ?? 0);
    if (!groupId || !userId) return;

    if (!isBlacklisted(groupId, userId)) return;

    const flag = pickField(raw, ['flag', 'request_id', 'requestId', 'seq', 'templateSeq']);
    if (flag === undefined || String(flag).trim() === '') {
        logError(
            `[群管助手] 拉黑拦截：加群申请没有 flag 字段，无法拒绝（group=${groupId} user=${userId}）`,
        );
        return;
    }

    // 邀请入群也一并拒绝：「一律拦截」不能留一个被拉黑的人被好友拉回去的口子
    const subType = String(pickField(raw, ['sub_type', 'subType']) ?? 'add').toLowerCase();
    const params = getFeatureSettings(groupId, 'blacklist').params;
    const reason = paramText(
        params,
        'blacklist_reject_reason',
        '你已被列入本群管的拉黑名单，如有疑问请联系管理员',
    );

    try {
        await callAction('set_group_add_request', {
            flag: String(flag),
            sub_type: subType === 'invite' ? 'invite' : 'add',
            approve: false,
            reason,
        });
        markRequestHandled(event);
        logDebug(`[群管助手] 拉黑拦截入群申请 group=${groupId} user=${userId} sub=${subType}`);
    } catch (e) {
        logError('[群管助手] 拉黑拦截：拒绝加群申请失败:', e);
    }
});

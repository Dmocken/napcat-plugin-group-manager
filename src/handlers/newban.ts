/**
 * 新人禁言（对应 nonebot/newban.py）
 *
 * - 新人入群：按本群配置的时长禁言，并发送通知文案（支持 {time} 与 {image=...}）
 * - 退群重进：若退群前仍处于禁言状态，按原时长重新禁言并发送警示文案
 * - 群内开关：newban open / newban close
 */

import { DEFAULT_NEWBAN_REMUTE, DEFAULT_NEWBAN_WELCOME } from '../constants';
import { findPendingBan, removeBanRecord, restoreBanRecord } from '../core/ban-records';
import { registerNotice } from '../core/events';
import { handleFeatureToggle } from '../core/feature-toggle';
import { at, callAction, renderTemplate, sendGroup } from '../core/messages';
import { findProfileByGroup, getFeatureSettings } from '../core/profiles';
import { registerCommand } from '../core/router';
import { logDebug, logError, logWarn } from '../core/state';
import { formatDuration, paramBool, paramNumber, paramString } from '../core/utils';

registerNotice('group_increase', 'newban', async (ctx) => {
    const { groupId, userId } = ctx;
    if (!groupId || !userId) return;

    const params = getFeatureSettings(groupId, 'newban').params;
    const banDuration = Math.max(0, Math.floor(paramNumber(params, 'ban_duration', 180)));
    const welcomeText = paramString(params, 'welcome_text', DEFAULT_NEWBAN_WELCOME);
    const remuteText = paramString(params, 'remute_text', DEFAULT_NEWBAN_REMUTE);

    // 「退群重进重新禁言」开关在「手动禁言 / 踢人 / 解禁 / 撤回」功能里，按群生效
    const remuteEnabled = paramBool(
        getFeatureSettings(groupId, 'ban').params,
        'remute_on_rejoin',
        true,
    );

    // 退群重进（有未过期禁言记录且开关打开）→ 按原时长重禁；否则按新人时长禁言。
    // 查找范围 = 该群所属配置组下的所有群：配置组内互通，换群不能逃避禁言。
    const scope = findProfileByGroup(groupId)?.group_ids ?? [String(groupId)];
    const hit = remuteEnabled ? findPendingBan(groupId, scope, userId) : null;
    const pending = hit?.record ?? null;
    const remute = pending !== null;
    const duration = remute ? Math.max(0, Math.floor(Number(pending?.duration) || 0)) : banDuration;
    const timeStr = formatDuration(duration);

    // 0) 先消费记录再发起禁言。
    // 禁言生效后 NapCat 会推 group_ban，那条通知会给同一条 key 写入新记录；
    // 如果反过来「先禁言、最后再删」，删除就可能落在新记录之后，把它误删掉。
    // 代价是中途失败会丢掉这条记录，所以下面失败分支要按原样还回去。
    if (hit) removeBanRecord(hit.groupId, userId);

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
        // 禁言没发出去 → 把刚消费掉的那条记录按原样放回去（ban_time 不变），
        // 否则这个人再退群重进就不会被重新禁言了，等于从记录里跑掉
        if (hit) {
            restoreBanRecord(hit.groupId, userId, hit.record);
            logDebug(
                `[群管助手] 重禁失败，记录已还原 group=${hit.groupId} user=${userId} duration=${hit.record.duration}`,
            );
        }
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
});

registerCommand({
    name: 'newban',
    feature: 'newban',
    block: true,
    permission: 'toggle',
    description: 'newban open / newban close — 开启或关闭本群新人禁言',
    handler: (c) =>
        handleFeatureToggle(c, 'newban', {
            onEcho: 'newban_on_echo',
            opened: 'newban_opened',
            offEcho: 'newban_off_echo',
            closed: 'newban_closed',
            usage: 'newban_usage',
        }),
});

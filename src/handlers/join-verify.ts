/**
 * 加群审核（对应 nonebot/group_join_verify.py）
 *
 * 收到加群申请（request/group/add）时自动审批：
 *   1. 群人数达到上限 → 拒绝
 *   2. 已在其它官方群 → 拒绝（依赖 group_members.json，由 /export 工具生成，可选）
 *   3. 答案表达「同意」→ 通过（QQ 等级 >= 阈值立刻通过，否则延迟指定秒数后通过）
 *   4. 其它情况 → 拒绝
 *
 * 判断改为关键词模式（不再依赖 jieba），词表可在插件配置页按群编辑。
 */

import { resolveWords, judgeAnswer } from '../services/text-judge';
import { registerRequest } from '../core/events';
import { callAction, sendGroup } from '../core/messages';
import { getFeatureSettings, setFeatureEnabled } from '../core/profiles';
import { registerCommand } from '../core/router';
import { logDebug, logError } from '../core/state';
import { readJson } from '../core/store';
import { schedule } from '../core/timers';
import { paramNumber, paramString } from '../core/utils';

/** 旧版 /export 生成的群成员名单文件（存在才做重复加群检查） */
const MEMBERS_FILE = 'group_members.json';

registerCommand({
    name: 'join',
    feature: 'join_verify',
    block: true,
    permission: 'toggle',
    description: 'join open / join close — 开启或关闭本群加群自动审批',
    handler: async (c) => {
        const arg = (c.argv[0] ?? '').toLowerCase();
        const enabled = getFeatureSettings(c.groupId, 'join_verify').enabled;

        if (arg === 'open') {
            if (enabled) {
                await sendGroup(c.groupId, '当前群的加群自动审批已经是开启状态');
                return;
            }
            setFeatureEnabled(c.groupId, 'join_verify', true);
            await sendGroup(c.groupId, `已开启群 ${c.groupId} 的加群自动审批`);
            return;
        }

        if (arg === 'close') {
            if (!enabled) {
                await sendGroup(c.groupId, '当前群的加群自动审批已经是关闭状态');
                return;
            }
            setFeatureEnabled(c.groupId, 'join_verify', false);
            await sendGroup(c.groupId, `已关闭群 ${c.groupId} 的加群自动审批`);
            return;
        }

        await sendGroup(c.groupId, '用法：join open 或 join close');
    },
});

registerRequest('group', 'join_verify', async (ctx) => {
    const event = ctx.event;

    // 只处理主动加群，忽略邀请入群
    if (event.sub_type !== 'add') return;

    const groupId = ctx.groupId;
    const userId = ctx.userId;
    const flag = String(event.flag ?? '');
    const subType = String(event.sub_type ?? 'add');
    if (!groupId || !userId || !flag) return;

    /** 提交审批结果 */
    const respond = async (approve: boolean, reason = ''): Promise<void> => {
        try {
            await callAction('set_group_add_request', { flag, sub_type: subType, approve, reason });
            logDebug(`[群管助手] 加群审批 group=${groupId} user=${userId} approve=${approve} reason=${reason}`);
        } catch (e) {
            logError('[群管助手] 提交加群审批失败:', e);
        }
    };

    const params = getFeatureSettings(groupId, 'join_verify').params;

    /* 1. 群满检查 */
    const maxSize = Math.floor(paramNumber(params, 'max_group_size', 2000));
    if (maxSize > 0) {
        try {
            const info = await callAction<{ member_count?: number }>('get_group_info', {
                group_id: String(groupId),
            });
            if (Number(info?.member_count ?? 0) >= maxSize) {
                await respond(false, paramString(params, 'group_full_reason', '群聊已满'));
                return;
            }
        } catch {
            /* 取不到群信息就跳过该检查 */
        }
    }

    /* 2. 重复加群检查（需要 group_members.json） */
    try {
        const members = readJson<Record<string, string[]>>(MEMBERS_FILE, {});
        const hasOtherGroup = Object.entries(members).some(
            ([gid, ids]) =>
                String(gid) !== String(groupId) && Array.isArray(ids) && ids.includes(String(userId)),
        );
        if (hasOtherGroup) {
            await respond(false, paramString(params, 'duplicate_reason', '您已加入其它官方群，请勿重复加群！'));
            return;
        }
    } catch {
        /* 文件不存在或格式错误则跳过 */
    }

    /* 3. 答案解析 + 语义判断 */
    let comment = String(event.comment ?? '').trim();
    if (comment.includes('答案：')) {
        comment = comment.split('答案：')[1]?.trim() ?? '';
    }

    const words = resolveWords(params.words);
    if (!judgeAnswer(comment, words)) {
        await respond(false);
        return;
    }

    /* 4. 按 QQ 等级决定立刻通过还是暂缓通过 */
    const levelThreshold = Math.floor(paramNumber(params, 'qq_level_threshold', 10));
    const delaySeconds = Math.max(0, Math.floor(paramNumber(params, 'delay_seconds', 1800)));

    let qqLevel = 0;
    try {
        const info = await callAction<{ level?: number }>('get_stranger_info', { user_id: String(userId) });
        qqLevel = Number(info?.level ?? 0);
    } catch {
        /* 取不到就当 0 级，走暂缓流程 */
    }

    if (qqLevel >= levelThreshold || delaySeconds === 0) {
        await respond(true);
        return;
    }

    schedule(delaySeconds * 1000, async () => {
        await respond(true);
    });
});

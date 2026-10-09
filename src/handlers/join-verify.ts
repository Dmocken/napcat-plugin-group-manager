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
import { paramText } from '../core/texts';
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
        const settings = getFeatureSettings(c.groupId, 'join_verify');
        const params = settings.params;
        const enabled = settings.enabled;

        if (arg === 'open') {
            if (enabled) {
                await sendGroup(c.groupId, paramText(params, 'join_on_echo', '当前群的加群自动审批已经是开启状态'));
                return;
            }
            setFeatureEnabled(c.groupId, 'join_verify', true);
            await sendGroup(
                c.groupId,
                paramText(params, 'join_opened', '已开启群 {group} 的加群自动审批', { group: c.groupId }),
            );
            return;
        }

        if (arg === 'close') {
            if (!enabled) {
                await sendGroup(c.groupId, paramText(params, 'join_off_echo', '当前群的加群自动审批已经是关闭状态'));
                return;
            }
            setFeatureEnabled(c.groupId, 'join_verify', false);
            await sendGroup(
                c.groupId,
                paramText(params, 'join_closed', '已关闭群 {group} 的加群自动审批', { group: c.groupId }),
            );
            return;
        }

        await sendGroup(c.groupId, paramText(params, 'join_usage', '用法：join open 或 join close'));
    },
});

registerRequest('group', 'join_verify', async (ctx) => {
    const event = ctx.event;
    const raw = event as unknown as Record<string, any>;

    /** 取第一个非空字段（不同 NapCat 版本的字段名可能是下划线或驼峰） */
    const pick = (keys: string[]): unknown => {
        for (const k of keys) {
            const v = raw[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return v;
        }
        return undefined;
    };

    const subTypeRaw = pick(['sub_type', 'subType', 'request_sub_type']);
    const flagRaw = pick(['flag', 'request_id', 'requestId', 'seq', 'templateSeq']);
    const userIdRaw = pick(['user_id', 'userId']);
    const groupIdRaw = pick(['group_id', 'groupId', 'groupCode']) ?? ctx.groupId;
    const commentRaw = pick(['comment', 'postscript', 'message']) ?? '';

    // 诊断日志：新版 NapCat 的加群请求字段与 OB11 标准可能有出入，先原样打出来
    logDebug(
        `[群管助手] 加群请求原始字段 keys=${Object.keys(raw).join(',')} | sub_type=${String(subTypeRaw)} | ` +
            `flag=${String(flagRaw)} | user_id=${String(userIdRaw)} | group_id=${String(groupIdRaw)} | comment=${JSON.stringify(String(commentRaw))}`,
    );

    // 只处理主动加群，忽略邀请入群（sub_type 缺失时按主动加群处理）
    const subType = String(subTypeRaw ?? 'add').toLowerCase();
    if (subType === 'invite') {
        logDebug('[群管助手] 这是邀请入群请求，加群审核不处理');
        return;
    }

    const groupId = Number(groupIdRaw ?? 0);
    const userId = Number(userIdRaw ?? 0);
    const flag = flagRaw === undefined ? '' : String(flagRaw);

    if (!groupId || !userId) {
        logError(
            `[群管助手] 加群请求缺少群号 / QQ 号，无法审批：group_id=${String(groupIdRaw)} user_id=${String(userIdRaw)}`,
        );
        return;
    }
    if (!flag) {
        logError(
            `[群管助手] 加群请求没有 flag 字段，无法调用 set_group_add_request（事件字段：${Object.keys(raw).join(',')}）`,
        );
        return;
    }

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
    let comment = String(commentRaw).trim();
    const answer = comment.match(/答案[：:]\s*([\s\S]*)$/);
    if (answer) comment = answer[1].trim();

    const words = resolveWords(params.words);
    if (!judgeAnswer(comment, words)) {
        logDebug(`[群管助手] 加群审核：答案未表达同意（"${comment}"），拒绝`);
        await respond(false);
        return;
    }
    logDebug(`[群管助手] 加群审核：答案 "${comment}" 判定为同意`);

    /* 4. 按 QQ 等级决定立刻通过还是暂缓通过 */
    const levelThreshold = Math.floor(paramNumber(params, 'qq_level_threshold', 10));
    const delaySeconds = Math.max(0, Math.floor(paramNumber(params, 'delay_seconds', 1800)));

    // NapCat 的 get_stranger_info 不保证返回 QQ 等级，字段名也随版本变化，这里都试一遍
    let qqLevel: number | null = null;
    try {
        const info = await callAction<Record<string, unknown>>('get_stranger_info', { user_id: String(userId) });
        logDebug(`[群管助手] 加群审核：get_stranger_info = ${JSON.stringify(info)}`);
        const rawLevel = info?.level ?? info?.qqLevel ?? info?.qq_level ?? info?.levelNum;
        if (
            rawLevel !== undefined &&
            rawLevel !== null &&
            String(rawLevel).trim() !== '' &&
            !Number.isNaN(Number(rawLevel))
        ) {
            qqLevel = Number(rawLevel);
        }
    } catch (e) {
        logDebug('[群管助手] 加群审核：调用 get_stranger_info 失败:', e);
    }

    if (qqLevel === null) {
        // 取不到等级就无从比较，直接放行（否则会一直被延迟卡住，看起来像「没反应」）
        logDebug(`[群管助手] 加群审核：未取到 QQ 等级，跳过等级判断，立即同意（阈值 ${levelThreshold}）`);
        await respond(true);
        return;
    }

    if (qqLevel >= levelThreshold || delaySeconds === 0) {
        logDebug(`[群管助手] 加群审核：QQ 等级 ${qqLevel} ≥ 阈值 ${levelThreshold}，立即同意`);
        await respond(true);
        return;
    }

    logDebug(
        `[群管助手] 加群审核：答案已通过，但 QQ 等级 ${qqLevel} < 阈值 ${levelThreshold}，` +
            `将在 ${delaySeconds} 秒后自动同意（改小延迟或把阈值设为 0 可立即通过）`,
    );
    schedule(delaySeconds * 1000, async () => {
        await respond(true);
    });
});

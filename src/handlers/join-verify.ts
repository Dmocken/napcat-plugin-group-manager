/**
 * 加群审核（对应 nonebot/group_join_verify.py）
 *
 * 收到加群申请（request/group/add）时自动审批：
 *   1. 群人数达到上限 → 拒绝
 *   2. 已在「参与查重的群」里 → 拒绝（范围按群配置，可在功能参数里开关与勾选）
 *   3. 答案表达「同意」→ 通过（QQ 等级 >= 阈值立刻通过，否则延迟指定秒数后通过）
 *   4. 其它情况 → 拒绝
 *
 * 判断改为关键词模式（不再依赖 jieba），词表可在插件配置页按群编辑。
 */

import { DEFAULT_AI_FAIL_NOTIFY, DEFAULT_AI_PROMPT, JUDGE_MODES, type JudgeMode } from '../constants';
import { callAiChat, parseAiVerdict } from '../services/ai-judge';
import { checkDuplicate } from '../services/dup-check';
import { resolveWords, judgeAnswer } from '../services/text-judge';
import { registerRequest } from '../core/events';
import { callAction, sendGroup, sendPrivate } from '../core/messages';
import { getFeatureSettings, setFeatureEnabled } from '../core/profiles';
import { registerCommand } from '../core/router';
import { getGlobal, logDebug, logError, logWarn } from '../core/state';
import { paramText } from '../core/texts';
import { schedule } from '../core/timers';
import { paramNumber, paramSelect, paramString } from '../core/utils';

const JUDGE_MODE_VALUES: readonly string[] = [
    JUDGE_MODES.semantic,
    JUDGE_MODES.ai,
    JUDGE_MODES.aiFallback,
];

/**
 * 读取审核方式；兼容旧配置 —— 只有 ai_enabled 时按开关推导：
 *   开启 → AI 审核（保持待处理）；关闭 → 关键词审核
 */
function resolveJudgeMode(params: Record<string, unknown>): JudgeMode {
    const explicit = paramSelect(params, 'judge_mode', JUDGE_MODES.semantic, JUDGE_MODE_VALUES);
    if (params.judge_mode !== undefined && params.judge_mode !== null && String(params.judge_mode).trim()) {
        return explicit as JudgeMode;
    }
    // ai_enabled 兼容：兼容早期存成 0/1 的值
    const legacy = params.ai_enabled === true || Number(params.ai_enabled) === 1;
    return legacy ? JUDGE_MODES.ai : JUDGE_MODES.semantic;
}

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

/** AI 判断失败：私聊所有 Bot 管理员，本次申请不自动审批（保持待处理） */
async function notifyAiFailure(
    params: Record<string, unknown>,
    vars: { group: number; user: number; question: string; answer: string; error: string },
): Promise<void> {
    const admins = getGlobal().global_admins ?? [];
    if (!admins.length) {
        logWarn('[群管助手] AI 判断失败，但没有配置 Bot 管理员，无法私聊通知');
        return;
    }

    const message = paramText(params, 'ai_fail_notify', DEFAULT_AI_FAIL_NOTIFY, {
        group: vars.group,
        user: vars.user,
        question: vars.question || '(未提供问题)',
        answer: vars.answer || '(未提供答案)',
        error: vars.error,
    });

    for (const admin of admins) {
        await sendPrivate(admin, message);
    }
}

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

    /* 2. 重复加群检测：范围按本配置「加群审核 → 参与查重的群」来，与其它群配置互不影响 */
    const dupEnabled = params.dup_check_enabled === true || Number(params.dup_check_enabled) === 1;
    if (dupEnabled) {
        const dupGroups = (Array.isArray(params.dup_check_groups) ? params.dup_check_groups : [])
            .map((g) => String(g).trim())
            .filter(Boolean);
        if (!dupGroups.length) {
            logDebug('[群管助手] 加群审核：已开启重复加群检测，但没有勾选任何群，本次跳过');
        } else {
            const dupResult = await checkDuplicate(dupGroups, groupId, userId);
            if (dupResult.warning) {
                logWarn(`[群管助手] 加群审核：${dupResult.warning}`);
            }
            if (dupResult.hit) {
                logDebug(
                    `[群管助手] 加群审核：检测到 ${userId} 已在群 ${dupResult.groupId}（${dupResult.used}）`,
                );
                await respond(
                    false,
                    paramString(params, 'duplicate_reason', '您已加入其它官方群，请勿重复加群！'),
                );
                return;
            }
        }
    }

    /* 3. 解析问题与答案（comment 形如「问题：xxx\n答案：yyy」） */
    const commentText = String(commentRaw).trim();
    let questionText = '';
    let answerText = commentText;
    const qa = commentText.match(/问题[：:]\s*([\s\S]*?)\s*答案[：:]\s*([\s\S]*)$/);
    if (qa) {
        questionText = qa[1].trim();
        answerText = qa[2].trim();
    } else {
        const onlyAnswer = commentText.match(/答案[：:]\s*([\s\S]*)$/);
        if (onlyAnswer) answerText = onlyAnswer[1].trim();
    }

    /* 4. 判断：按审核方式走关键词 / AI / AI 失败降级三条路径 */
    const words = resolveWords(params.words);
    const semanticVerdict = judgeAnswer(answerText, words);
    logDebug(`[群管助手] 加群审核：词表判定=${semanticVerdict}（答案 "${answerText}"）`);

    // 兼容旧配置：judge_mode 缺失时按旧的 ai_enabled 开关推导
    const mode = resolveJudgeMode(params);

    let approved: boolean;
    let how: string;

    if (mode === JUDGE_MODES.semantic) {
        approved = semanticVerdict;
        how = '关键词';
    } else {
        const call = await callAiChat(
            {
                baseUrl: paramString(params, 'ai_base_url', 'https://api.deepseek.com'),
                apiKey: paramString(params, 'ai_api_key', ''),
                model: paramString(params, 'ai_model', 'deepseek-chat'),
                prompt: paramString(params, 'ai_prompt', DEFAULT_AI_PROMPT),
                timeoutMs: paramNumber(params, 'ai_timeout_ms', 10000),
            },
            questionText,
            answerText,
        );

        let aiVerdict: boolean | null = null;
        let failReason = '';
        if (!call.ok) {
            failReason = call.error;
        } else {
            aiVerdict = parseAiVerdict(call.content);
            if (aiVerdict === null) {
                failReason = `模型回复无法解析出 1/0：${JSON.stringify(call.content.slice(0, 120))}`;
            }
        }

        if (aiVerdict !== null) {
            approved = aiVerdict;
            how = 'AI';
        } else if (mode === JUDGE_MODES.aiFallback) {
            // 降级：改用词表判断继续审批，同时通知管理员
            approved = semanticVerdict;
            how = 'AI 失败降级';
            logError(
                `[群管助手] 加群审核：AI 判断失败（${failReason}），已降级为词表判断（结果=${approved}）并通知管理员`,
            );
            await notifyAiFailure(params, {
                group: groupId,
                user: userId,
                question: questionText,
                answer: answerText,
                error: `${failReason}（已降级为关键词审核，判定：${approved ? '通过' : '拒绝'}）`,
            });
        } else {
            //纯 AI 模式：保持待处理，等管理员手动处理
            logError(`[群管助手] 加群审核：AI 判断失败（${failReason}），已通知管理员手动处理`);
            await notifyAiFailure(params, {
                group: groupId,
                user: userId,
                question: questionText,
                answer: answerText,
                error: failReason,
            });
            return;
        }
    }

    if (!approved) {
        logDebug(`[群管助手] 加群审核：${how}判定不通过，拒绝`);
        await respond(false);
        return;
    }
    logDebug(`[群管助手] 加群审核：${how}判定通过，进入等级判断`);

    /* 5. 按 QQ 等级决定立刻通过还是暂缓通过 */
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

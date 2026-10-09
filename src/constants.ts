/**
 * 群管助手 - 常量与功能元信息
 *
 * 功能参数默认值全部沿用旧 NoneBot 版的硬编码配置，
 * 保证迁移后行为一致（见 nonebot/ 下各插件的「配置区」）。
 */

import type {
    FeatureKey,
    FeatureMeta,
    FeatureSettings,
    GlobalConfig,
    GroupProfile,
    ParamMeta,
    ParamType,
} from './types';

export const PLUGIN_ID = 'napcat-plugin-group-manager';
export const PLUGIN_DISPLAY_NAME = '群管助手';

/** 全部功能标识 */
export const FEATURE_KEYS: FeatureKey[] = [
    'ban',
    'random_ban',
    'black',
    'newban',
    'check_silent',
    'join_verify',
    'recall_stats',
];

/** 默认全局配置 */
export const DEFAULT_GLOBAL: GlobalConfig = {
    enabled: true,
    debug: false,
    command_prefix: '/',
    global_admins: [],
};

/** 新人禁言的默认文案（沿用旧版 nonebot/newban.py） */
export const DEFAULT_NEWBAN_WELCOME =
    '新人进群首先禁言{time}。\nPhira相关下载方式及其使用的问题均在群公告！';
export const DEFAULT_NEWBAN_REMUTE =
    ' 检测到你在退群前处于禁言状态，重新施加禁言{time}。\n' +
    '这不是新入群禁言，请不要尝试通过退群重进来逃避禁言！\n' +
    'Phira相关下载方式及其使用的问题均在群公告！';

/**
 * 加群审核关键词表默认值
 * 原自 nonebot/group_join_verify.py 的 AGREEMENT_WORDS / NEGATION_MODIFIERS /
 * EXPLICIT_REJECTION / DOUBLE_NEGATION_TRIGGERS（去掉 jieba，改为关键词「最早信号优先」判断）
 */
export const DEFAULT_JUDGE_WORDS = {
    agree: [
        '同意', '愿意', '可以', '好的', '行', '能', '接受', '答应', '是', '对', '会', '要', '想', '好', '嗯',
        '支持', '喜欢', '期待', '希望', '加入', '来', '进', '必须',
        'ok', 'yes', 'yep', 'yeah', 'sure',
        '是的', '对的', '好吧', '行吧', '可以啊', '行啊', '好啊', '来啊', '来来来',
    ],
    negation: ['不', '没', '别', '无', '未', '非', '否', '莫', '休', '勿'],
    reject: [
        '拒绝', '不行', '不要', '不想', '不能', '不好', '不可以',
        '不愿意', '不同意', '不会', '不干', '免了', '算了', '不加', '不进了', '不进', '别拉我',
        'no', 'nope', 'nah', 'non',
    ],
    double_negation: ['没说', '没有', '不是', '并非'],
};

/* ---------------- AI 判断相关常量 ---------------- */

/** AI 判断提示词默认值：{question} / {answer} 会被替换 */
export const DEFAULT_AI_PROMPT =
    '你是一个正在审批 QQ 群入群申请的管理员。入群的问题是：“{question}”\n' +
    '请你判断一下用户的回答是否有强烈表达出愿意的倾向。如果有，则只输出数字字符 1；如果没有，则输出 0。\n' +
    '答案：“{answer}”';

/** AI 判断失败时私聊管理员的通知文案 */
export const DEFAULT_AI_FAIL_NOTIFY =
    '⚠️ 加群 AI 审批出现问题，这条申请需要你手动处理\n' +
    '群：{group}\n申请人：{user}\n问题：{question}\n答案：{answer}\n错误：{error}';

/* ---------------- 可自定义提示文案 ---------------- */

/** 文案参数统一构造：默认单行输入，长文本用 textarea */
function textParam(key: string, label: string, def: string, type: ParamType = 'text'): ParamMeta {
    return { key, label, type, default: def, group: '提示文案' };
}

/**
 * 各功能的提示文案参数（WebUI 里按「提示文案」分组展示，默认收起）
 *
 * 占位符：{user} 目标 QQ、{time} 时长、{seconds} 秒数、{clock} 时间点、
 *        {id} 编号、{content} 正文、{group} 群号、{count} 次数、{error} 错误信息
 */
export const FEATURE_TEXT_PARAMS: Record<string, ParamMeta[]> = {
    ban: [
        textParam('ban_no_target', 'ban 未 @ 用户', '你要把谁关进小黑屋？'),
        textParam(
            'ban_bad_format',
            'ban 缺少时长/单位',
            '格式错误！正确格式：ban @用户 时长 单位（秒/分/时/天），中间都有空格哦',
        ),
        textParam(
            'ban_bad_duration',
            'ban 时长无法解析',
            '格式输错啦！正确格式：ban @用户 时长 单位（秒/分/时/天），中间都有空格哦',
        ),
        textParam('ban_success', '禁言成功回执', '已成功把用户 {user} 禁言{time}'),
        textParam('ban_failed', '禁言失败', '禁言失败：{error}'),
        textParam('ban_maybe_failed', '禁言无回执提示', '禁言操作可能失败，请检查机器人权限'),
        textParam('kick_no_target', 'kick 未 @ 用户', '你要踢谁？'),
        textParam('kick_success', '踢人成功', '{user} 消失啦~'),
        textParam('kick_failed', '踢人失败', '踢人失败：{error}'),
        textParam('unban_no_target', 'unban 未 @ 用户', '你想把谁放出小黑屋？'),
        textParam('unban_success', '解禁成功', '已将 {user} 放出小黑屋'),
        textParam('unban_failed', '解禁失败', '解禁失败：{error}'),
        textParam('recall_no_target', '撤回未引用消息', '你要撤回哪条消息？'),
        textParam('recall_failed', '撤回失败', '撤回失败：{error}'),
        textParam('kick_admin_warn', '踢到 Bot 管理员时吐槽', '铸币你要不看看你在踢谁？'),
    ],
    random_ban: [
        textParam('sm_no_target', 'sm 未 @ 用户', '请@要禁言的用户'),
        textParam('sm_admin_deny', 'sm 目标是 Bot 管理员', 'sm谁？你sm一个试试看？'),
        textParam(
            'sm_success',
            '随机禁言成功',
            '已将小杂鱼{user}随机禁言{seconds}秒♥\n乖乖呆在我的小黑屋里面到 {clock}吧！',
            'textarea',
        ),
        textParam('sm_failed', '随机禁言失败', '禁言失败，你不会认真一点吗？ {error}'),
    ],
    black: [
        textParam('black_no_reply', '入典未引用消息', '你想让我记住什么啊？'),
        textParam('black_unsupported', '入典消息类型不支持', '这种消息我还记不住啦！'),
        textParam('black_fetch_failed', '入典取消息失败', '我拿不到那条消息，记不住啦！'),
        textParam('black_added', '入典成功', '我记住这b的黑历史啦！编号为：{id}'),
        textParam('black_empty', '还没有任何黑历史', '还没有记录任何黑历史呢'),
        textParam('black_user_empty', '该用户没有黑历史', '这个人还没有黑历史呢~'),
        textParam('black_bad_id', '查询编号非法', '你写的这玩意儿是编号吗？！'),
        textParam('black_id_not_found', '查询编号不存在', '没有找到编号为 {id} 的黑历史！'),
        textParam('black_found', '查询结果', '找到{user}的黑历史(ID:{id})：\n{content}', 'textarea'),
        textParam('black_del_no_arg', '删除未给编号', '删哪个？'),
        textParam('black_del_bad_id', '删除编号非法', '我数数是用的数字数的！'),
        textParam('black_del_not_found', '删除的编号不存在', '我这儿都没有编号为 {id} 的黑历史啊！'),
        textParam('black_deleted', '删除成功', '我忘掉编号为 {id} 的黑历史了！'),
    ],
    newban: [
        textParam('newban_on_echo', '已开启时提示', '当前群的新人禁言已经是开启状态'),
        textParam('newban_opened', '开启成功', '已开启群 {group} 的新人禁言'),
        textParam('newban_off_echo', '已关闭时提示', '当前群的新人禁言已经是关闭状态'),
        textParam('newban_closed', '关闭成功', '已关闭群 {group} 的新人禁言'),
        textParam('newban_usage', '用法提示', '用法：newban open 或 newban close'),
    ],
    check_silent: [
        textParam('check_no_permission', '群内权限不足', '⛔ 该功能仅限群主或管理员使用。'),
        textParam('check_private_only', '私聊权限不足', '⛔ 私聊指令仅限机器人主人使用。'),
        textParam('check_user_usage', 'check user 参数错误', '用法：check user [QQ号]'),
        textParam('check_group_required', '私聊未给群号', '请指定群号，例如：check group 123456'),
        textParam(
            'check_usage_group',
            '群聊用法说明',
            '用法：\n' +
                '  check — 检查并记录入群超过 N 天且从未发言的成员\n' +
                '  check kick — 一键踢出已记录的静默成员\n' +
                '  check kick [原因] — 踢出前私聊发送原因\n' +
                '  check user [QQ号] — 查看某成员的入群时间和发言时间\n' +
                '  check debug — 调试：查看 API 返回的原始成员数据',
            'textarea',
        ),
        textParam(
            'check_usage_private',
            '私聊用法说明',
            '私聊用法：\n' +
                '  check group [群号] — 检查指定群\n' +
                '  check group [群号] kick — 一键踢出已记录的静默成员\n' +
                '  check group [群号] kick [原因] — 踢出前私聊通知\n' +
                '  check group [群号] debug — 调试：查看 API 原始数据',
            'textarea',
        ),
    ],
    join_verify: [
        textParam('join_on_echo', '已开启时提示', '当前群的加群自动审批已经是开启状态'),
        textParam('join_opened', '开启成功', '已开启群 {group} 的加群自动审批'),
        textParam('join_off_echo', '已关闭时提示', '当前群的加群自动审批已经是关闭状态'),
        textParam('join_closed', '关闭成功', '已关闭群 {group} 的加群自动审批'),
        textParam('join_usage', '用法提示', '用法：join open 或 join close'),
        textParam('ai_fail_notify', 'AI 审批异常私聊通知', DEFAULT_AI_FAIL_NOTIFY, 'textarea'),
    ],
    recall_stats: [
        textParam('recall_on_echo', '已开启时提示', '当前群的撤回消息统计已经是开启状态'),
        textParam('recall_opened', '开启成功', '已开启群 {group} 的撤回消息统计'),
        textParam('recall_off_echo', '已关闭时提示', '当前群的撤回消息统计已经是关闭状态'),
        textParam('recall_closed', '关闭成功', '已关闭群 {group} 的撤回消息统计'),
        textParam('recall_usage_group', '群聊用法提示', '群聊用法：recall open 或 recall close'),
        textParam(
            'recall_private_usage',
            '私聊用法提示',
            '私聊用法：recall <群号> <QQ号>\n例如：recall 123456789 987654321',
            'textarea',
        ),
        textParam('recall_bad_number', '群号/QQ 号格式错误', '群号或 QQ 号格式错误，请输入数字'),
        textParam(
            'recall_verify_failed',
            '私聊校验成员身份失败',
            '无法验证你的群成员身份，请确认群号正确且你是该群管理员',
        ),
        textParam(
            'recall_no_private_permission',
            '私聊查询权限不足',
            '你没有权限执行此操作（仅该群群主、群管理或 Bot 主人可用）',
        ),
        textParam('recall_group_disabled', '目标群未开启统计', '该群未开启撤回消息统计，请先在群内使用 recall open 开启'),
        textParam('recall_no_record', '没有撤回记录', '用户 {user} 在群 {group} 没有被撤回的记录'),
    ],
};

/* ---------------- 加群审核的 AI 判断参数 ---------------- */

/** 走 OpenAI 兼容接口（DeepSeek 等）所需的参数 */
export const AI_PARAMS: ParamMeta[] = [
    {
        key: 'ai_enabled',
        label: '启用 AI 判断',
        type: 'boolean',
        default: false,
        group: 'AI 判断',
        hint: '开启后由 AI 判断入群答案：返回 1 → 通过，返回 0 → 拒绝；调用失败会私聊 Bot 管理员并跳过本次自动审批',
    },
    {
        key: 'ai_base_url',
        label: '接口地址',
        type: 'text',
        default: 'https://api.deepseek.com',
        group: 'AI 判断',
        hint: 'OpenAI 兼容接口的根地址，会自动拼 /chat/completions（DeepSeek：https://api.deepseek.com）',
    },
    {
        key: 'ai_api_key',
        label: 'API Key',
        type: 'password',
        default: '',
        group: 'AI 判断',
        hint: 'sk-... 建议同时在「插件配置」里设置页面访问密码，否则外部访问页面能读到这里的内容',
    },
    {
        key: 'ai_model',
        label: '模型',
        type: 'text',
        default: 'deepseek-chat',
        group: 'AI 判断',
        hint: '如 deepseek-chat / deepseek-flash / deepseek-v4-pro，按你的服务商文档填写',
    },
    {
        key: 'ai_prompt',
        label: '判断提示词',
        type: 'textarea',
        default: DEFAULT_AI_PROMPT,
        group: 'AI 判断',
        hint: '{question} 与 {answer} 会替换为申请时的问题和回答；要求模型只输出 1（同意）或 0（不同意）',
    },
    {
        key: 'ai_timeout_ms',
        label: '请求超时（毫秒）',
        type: 'number',
        default: 10000,
        group: 'AI 判断',
    },
];

/** 功能元信息（WebUI 依据此表渲染） */
export const FEATURES: FeatureMeta[] = [
    {
        key: 'ban',
        label: '手动禁言 / 踢人 / 解禁 / 撤回',
        usage: 'ban @用户 时长 单位（秒/分/时/天）\nkick @用户\nunban @用户\n撤回消息（引用要撤回的消息）',
        block: false,
        implemented: true,
        params: [...(FEATURE_TEXT_PARAMS.ban ?? [])],
    },
    {
        key: 'random_ban',
        label: '随机禁言',
        usage: '直接发送 sm 或 smplus（无需前缀）\n有权限时：sm @用户 随机禁言被 @ 的人\n无权限时：sm 禁言自己',
        block: true,
        implemented: true,
        params: [
            { key: 'sm_min', label: 'sm 最短时长（秒）', type: 'number', default: 1 },
            { key: 'sm_max', label: 'sm 最长时长（秒）', type: 'number', default: 3600 },
            { key: 'smplus_min', label: 'smplus 最短时长（秒）', type: 'number', default: 1 },
            { key: 'smplus_max', label: 'smplus 最长时长（秒）', type: 'number', default: 28800 },
            ...(FEATURE_TEXT_PARAMS.random_ban ?? []),
        ],
    },
    {
        key: 'black',
        label: '黑历史',
        usage: '入典（引用一条纯文字消息）\n查看黑历史 [编号 / @某人]\n删除黑历史 编号',
        block: false,
        implemented: true,
        params: [...(FEATURE_TEXT_PARAMS.black ?? [])],
    },
    {
        key: 'newban',
        label: '新人禁言',
        usage: 'newban open / newban close\n新人入群自动禁言并发送通知（含退群重进重禁）',
        block: true,
        implemented: true,
        params: [
            { key: 'ban_duration', label: '默认禁言时长（秒）', type: 'number', default: 180 },
            {
                key: 'welcome_text',
                label: '新人进群通知文案',
                type: 'textarea',
                default: DEFAULT_NEWBAN_WELCOME,
                hint: '{time} 会替换为人类可读时长；{image=/assets/tip.png} 会替换为图片',
                group: '提示文案',
            },
            {
                key: 'remute_text',
                label: '退群重进重新禁言文案',
                type: 'textarea',
                default: DEFAULT_NEWBAN_REMUTE,
                hint: '同上，支持 {time} 与 {image=...}',
                group: '提示文案',
            },
            ...(FEATURE_TEXT_PARAMS.newban ?? []),
        ],
    },
    {
        key: 'check_silent',
        label: '静默成员检查',
        usage: 'check —— 检查并记录入群超 N 天且从未发言的成员\ncheck kick [原因] —— 踢出已记录的静默成员\ncheck user QQ号 —— 查看某成员入群与发言时间\ncheck debug —— 输出接口原始数据',
        block: true,
        implemented: true,
        params: [
            { key: 'days', label: '判定天数', type: 'number', default: 3, hint: '入群超过该天数且从未发言视为静默' },
            {
                key: 'treat_unknown_eligible',
                label: '取不到入群时间时是否视为符合条件',
                type: 'number',
                default: 1,
                hint: '1 = 视为符合条件（保守筛查），0 = 跳过',
            },
            { key: 'kick_reason', label: '默认踢出原因（可留空）', type: 'text', default: '' },
            ...(FEATURE_TEXT_PARAMS.check_silent ?? []),
        ],
    },
    {
        key: 'join_verify',
        label: '加群审核',
        usage: 'join open / join close\n开启后自动审批加群申请：已在其它官方群 → 拒绝；答案表达同意 → 通过',
        block: true,
        implemented: true,
        actions: [{ key: 'ai_test', label: '测试 API Key' }],
        params: [
            { key: 'qq_level_threshold', label: 'QQ 等级阈值', type: 'number', default: 10, hint: '等级 ≥ 阈值立刻通过，否则延迟后通过' },
            { key: 'delay_seconds', label: '低等级延迟通过秒数', type: 'number', default: 1800 },
            { key: 'max_group_size', label: '群人数上限', type: 'number', default: 2000, hint: '达到上限直接拒绝，0 表示不检查' },
            {
                key: 'duplicate_reason',
                label: '重复加群拒绝理由',
                type: 'text',
                default: '您已加入其它官方群，请勿重复加群！',
                group: '提示文案',
            },
            {
                key: 'group_full_reason',
                label: '群满拒绝理由',
                type: 'text',
                default: '群聊已满，如有需要可以先加入Phira官方QQ频道',
                group: '提示文案',
            },
            ...(FEATURE_TEXT_PARAMS.join_verify ?? []),
            {
                key: 'words',
                label: '语义判断词表',
                type: 'wordlists',
                default: DEFAULT_JUDGE_WORDS,
                hint:
                    '按「最先出现的信号」判断：命中同意词即通过，命中拒绝词或被否定的同意词即拒绝。' +
                    '回车或点「添加」逐个添加，也支持用逗号一次粘贴多个；某项留空则使用内置默认词表。',
                subKeys: [
                    { key: 'agree', label: '同意词' },
                    { key: 'negation', label: '否定修饰词' },
                    { key: 'reject', label: '显式拒绝词' },
                    { key: 'double_negation', label: '双重否定触发词' },
                ],
            },
            ...AI_PARAMS,
        ],
    },
    {
        key: 'recall_stats',
        label: '撤回消息统计',
        usage: 'recall open / recall close\n私聊：recall 群号 QQ号 —— 查询某成员被撤回记录',
        block: true,
        implemented: true,
        params: [
            { key: 'thresholds', label: '提醒次数阈值（逗号分隔）', type: 'numberlist', default: [3, 5] },
            {
                key: 'warning_text',
                label: '撤回提醒文案',
                type: 'text',
                default: '您已被撤回消息 {count} 次，请注意言行，遵守群规！',
                hint: '{count} 会替换为次数',
                group: '提示文案',
            },
            ...(FEATURE_TEXT_PARAMS.recall_stats ?? []),
        ],
    },
];

export const FEATURE_MAP: Record<string, FeatureMeta> = Object.fromEntries(
    FEATURES.map((f) => [f.key, f])
);

/** 由元信息生成某功能的默认参数 */
export function defaultParams(key: FeatureKey): Record<string, unknown> {
    const meta = FEATURE_MAP[key];
    if (!meta) return {};
    const out: Record<string, unknown> = {};
    for (const p of meta.params) {
        out[p.key] = typeof p.default === 'object' && p.default !== null
            ? JSON.parse(JSON.stringify(p.default))
            : p.default;
    }
    return out;
}

/** 由元信息生成某功能的默认设置（默认全部不启用） */
export function defaultFeatureSettings(key: FeatureKey): FeatureSettings {
    return {
        enabled: false,
        allow_group_admin: false,
        allowed_users: [],
        params: defaultParams(key),
    };
}

/** 生成一条空白群配置 */
export function createEmptyProfile(id: string, label = '新建群配置'): GroupProfile {
    const features: Record<string, FeatureSettings> = {};
    for (const key of FEATURE_KEYS) features[key] = defaultFeatureSettings(key);
    return { id, label, group_ids: [], features };
}

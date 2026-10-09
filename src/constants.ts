/**
 * 群管助手 - 常量与功能元信息
 *
 * 功能参数默认值全部沿用旧 NoneBot 版的硬编码配置，
 * 保证迁移后行为一致（见 nonebot/ 下各插件的「配置区」）。
 */

import type { FeatureKey, FeatureMeta, FeatureSettings, GlobalConfig, GroupProfile } from './types';

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

/** 功能元信息（WebUI 依据此表渲染） */
export const FEATURES: FeatureMeta[] = [
    {
        key: 'ban',
        label: '手动禁言 / 踢人 / 解禁 / 撤回',
        usage: 'ban @用户 时长 单位（秒/分/时/天）\nkick @用户\nunban @用户\n撤回消息（引用要撤回的消息）',
        block: false,
        implemented: false,
        params: [],
    },
    {
        key: 'random_ban',
        label: '随机禁言',
        usage: '直接发送 sm 或 smplus（无需前缀）\n有权限时：sm @用户 随机禁言被 @ 的人\n无权限时：sm 禁言自己',
        block: true,
        implemented: false,
        params: [
            { key: 'sm_min', label: 'sm 最短时长（秒）', type: 'number', default: 1 },
            { key: 'sm_max', label: 'sm 最长时长（秒）', type: 'number', default: 3600 },
            { key: 'smplus_min', label: 'smplus 最短时长（秒）', type: 'number', default: 1 },
            { key: 'smplus_max', label: 'smplus 最长时长（秒）', type: 'number', default: 28800 },
        ],
    },
    {
        key: 'black',
        label: '黑历史',
        usage: '入典（引用一条纯文字消息）\n查看黑历史 [编号 / @某人]\n删除黑历史 编号',
        block: false,
        implemented: true,
        params: [],
    },
    {
        key: 'newban',
        label: '新人禁言',
        usage: 'newban open / newban close\n新人入群自动禁言并发送通知（含退群重进重禁）',
        block: true,
        implemented: false,
        params: [
            { key: 'ban_duration', label: '默认禁言时长（秒）', type: 'number', default: 180 },
            {
                key: 'welcome_text',
                label: '新人进群通知文案',
                type: 'textarea',
                default: '新人进群首先禁言{time}。\nPhira相关下载方式及其使用的问题均在群公告！',
                hint: '{time} 会替换为人类可读时长；{image=/assets/tip.png} 会替换为图片',
            },
            {
                key: 'remute_text',
                label: '退群重进重新禁言文案',
                type: 'textarea',
                default: ' 检测到你在退群前处于禁言状态，重新施加禁言{time}。\n这不是新入群禁言，请不要尝试通过退群重进来逃避禁言！',
                hint: '同上，支持 {time} 与 {image=...}',
            },
        ],
    },
    {
        key: 'check_silent',
        label: '静默成员检查',
        usage: 'check —— 检查并记录入群超 N 天且从未发言的成员\ncheck kick [原因] —— 踢出已记录的静默成员\ncheck user QQ号 —— 查看某成员入群与发言时间\ncheck debug —— 输出接口原始数据',
        block: true,
        implemented: false,
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
        ],
    },
    {
        key: 'join_verify',
        label: '加群审核',
        usage: 'join open / join close\n开启后自动审批加群申请：已在其它官方群 → 拒绝；答案表达同意 → 通过',
        block: true,
        implemented: false,
        params: [
            { key: 'qq_level_threshold', label: 'QQ 等级阈值', type: 'number', default: 10, hint: '等级 ≥ 阈值立刻通过，否则延迟后通过' },
            { key: 'delay_seconds', label: '低等级延迟通过秒数', type: 'number', default: 1800 },
            { key: 'max_group_size', label: '群人数上限', type: 'number', default: 2000, hint: '达到上限直接拒绝，0 表示不检查' },
            { key: 'duplicate_reason', label: '重复加群拒绝理由', type: 'text', default: '您已加入其它官方群，请勿重复加群！' },
            { key: 'group_full_reason', label: '群满拒绝理由', type: 'text', default: '群聊已满，如有需要可以先加入Phira官方QQ频道' },
            {
                key: 'words',
                label: '语义判断词表',
                type: 'wordlists',
                default: DEFAULT_JUDGE_WORDS,
                hint: '按「最先出现的信号」判断：命中同意词即通过，命中拒绝词或被否定的同意词即拒绝',
                subKeys: [
                    { key: 'agree', label: '同意词（每行一个）' },
                    { key: 'negation', label: '否定修饰词' },
                    { key: 'reject', label: '显式拒绝词' },
                    { key: 'double_negation', label: '双重否定触发词' },
                ],
            },
        ],
    },
    {
        key: 'recall_stats',
        label: '撤回消息统计',
        usage: 'recall open / recall close\n私聊：recall 群号 QQ号 —— 查询某成员被撤回记录',
        block: true,
        implemented: false,
        params: [
            { key: 'thresholds', label: '提醒次数阈值（逗号分隔）', type: 'numberlist', default: [3, 5] },
            {
                key: 'warning_text',
                label: '撤回提醒文案',
                type: 'text',
                default: '您已被撤回消息 {count} 次，请注意言行，遵守群规！',
                hint: '{count} 会替换为次数',
            },
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

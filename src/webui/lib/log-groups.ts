/**
 * 日志曲线的业务分组
 *
 * 图表默认按「业务语义」合并成 6 条线，而不是每个命令 / feature 一条：
 *   禁言       ban / unban / sm / smplus / newban
 *   成员管理   kick / join / black / unblack
 *   撤回       撤回 / recall
 *   黑历史     入典 / 查看黑历史 / 删除黑历史
 *   静默检查   check
 *   系统       ping / help
 *
 * 注意 black 的歧义：活动里的命令 black 是「拉黑」（feature=blacklist），
 * 而 feature black 是「黑历史」（命令 入典）。所以活动日志优先按命令映射，
 * 异常日志优先按 command 映射，拿不到再回退到 feature。
 */

export type LogGroup = '禁言' | '成员管理' | '撤回' | '黑历史' | '静默检查' | '系统';

/** 默认展示顺序（也是图表 seed 的顺序，保证六条都在） */
export const LOG_GROUP_ORDER: LogGroup[] = [
    '禁言',
    '成员管理',
    '撤回',
    '黑历史',
    '静默检查',
    '系统',
];

/** 命令名 → 业务组 */
const ACTION_GROUP: Record<string, LogGroup> = {
    ban: '禁言',
    unban: '禁言',
    sm: '禁言',
    smplus: '禁言',
    newban: '禁言',
    kick: '成员管理',
    join: '成员管理',
    black: '成员管理',
    unblack: '成员管理',
    撤回: '撤回',
    recall: '撤回',
    入典: '黑历史',
    查看黑历史: '黑历史',
    删除黑历史: '黑历史',
    check: '静默检查',
    ping: '系统',
    help: '系统',
};

/** feature → 业务组（异常日志 / 活动日志的兜底） */
const FEATURE_GROUP: Record<string, LogGroup> = {
    ban: '禁言',
    random_ban: '禁言',
    newban: '禁言',
    sm_stats: '禁言',
    blacklist: '成员管理',
    join_verify: '成员管理',
    recall_stats: '撤回',
    black: '黑历史',
    check_silent: '静默检查',
    system: '系统',
};

/** 活动日志：命令名优先，未知命令再按 feature 兜底 */
export function activityGroup(action: string, feature: string): string {
    return ACTION_GROUP[action] ?? FEATURE_GROUP[feature] ?? '其他';
}

/** 异常日志：command 优先（可区分 kick / 撤回），再按 feature 兜底 */
export function errorGroup(feature: string, command?: string): string {
    if (command && ACTION_GROUP[command]) return ACTION_GROUP[command];
    return FEATURE_GROUP[feature] ?? '其他';
}

/** 活动日志每组包含的命令（图例下拉多选的子项） */
export const ACTIVITY_GROUP_CHILDREN: Record<LogGroup, string[]> = {
    禁言: ['ban', 'unban', 'sm', 'smplus', 'newban'],
    成员管理: ['kick', 'join', 'black', 'unblack'],
    撤回: ['撤回', 'recall'],
    黑历史: ['入典', '查看黑历史', '删除黑历史'],
    静默检查: ['check'],
    系统: ['ping', 'help'],
};

/** 异常日志每组包含的 feature（异常没有命令维度时按它拆分） */
export const ERROR_GROUP_CHILDREN: Record<LogGroup, string[]> = {
    禁言: ['ban', 'random_ban', 'newban', 'sm_stats'],
    成员管理: ['blacklist', 'join_verify'],
    撤回: ['recall_stats'],
    黑历史: ['black'],
    静默检查: ['check_silent'],
    系统: ['system'],
};

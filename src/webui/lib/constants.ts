import {
    BarChart3,
    BookMarked,
    Circle,
    ClipboardCheck,
    Gavel,
    SearchX,
    Shuffle,
    UserPlus,
    type LucideIcon,
} from 'lucide-react';

/** 参数分组名：该组统一放在「提示文案」页签，不出现在功能行里 */
export const TEXT_GROUP = '提示文案';

/** 通用提示文案字段（全局设置里可覆盖，留空表示用内置默认值） */
export const TEXT_FIELDS = [
    { key: 'no_permission', label: '无权限提示', fallback: '您没有权限使用该功能。' },
    { key: 'need_group', label: '仅群聊可用提示', fallback: '该命令只能在群聊中使用。' },
    { key: 'need_private', label: '仅私聊可用提示', fallback: '该命令只能在私聊中使用。' },
    { key: 'feature_disabled', label: '功能未启用提示', fallback: '本群未启用该功能。' },
] as const;

/* ---------------- 功能图标与短名 ----------------
   替代原先的 emoji / 纯文字：短名用于功能矩阵列头与列表行，
   图标用于各处视觉识别，完整名称仍以后端 meta.label 为准。 */

export const FEATURE_ICONS: Record<string, LucideIcon> = {
    ban: Gavel,
    random_ban: Shuffle,
    black: BookMarked,
    newban: UserPlus,
    check_silent: SearchX,
    join_verify: ClipboardCheck,
    recall_stats: BarChart3,
};

export const FEATURE_SHORT: Record<string, string> = {
    ban: '禁言/踢人',
    random_ban: '随机禁言',
    black: '黑历史',
    newban: '新人禁言',
    check_silent: '静默检查',
    join_verify: '加群审核',
    recall_stats: '撤回统计',
};

/** 取功能图标，未知 key 退化为通用圆点 */
export function featureIcon(key: string): LucideIcon {
    return FEATURE_ICONS[key] ?? Circle;
}

/** 取功能短名，未知 key 直接显示 key */
export function featureShort(key: string, fallback = ''): string {
    return FEATURE_SHORT[key] ?? fallback ?? key;
}

/** 胶囊列表编辑器的默认批量分隔符 */
export const DEFAULT_SPLITTER = /[,，;；\s]+/;
/** 词表类编辑器按行分隔，避免把含空格的词组拆开 */
export const WORDLIST_SPLITTER = /[,，;；\n\r\t]+/;
/** numberlist 参数：只按逗号 / 空白切分 */
export const NUMBERLIST_SPLITTER = /[,，\s]+/;

/** 值是否相同（用于「已修改 / 恢复默认」判断） */
export function sameValue(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
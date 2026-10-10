/**
 * 群管助手 - 类型定义
 */

/** 功能标识（与旧 NoneBot 版 PLUGIN_* 常量一一对应） */
export type FeatureKey =
    | 'ban'
    | 'random_ban'
    | 'black'
    | 'newban'
    | 'check_silent'
    | 'join_verify'
    | 'recall_stats';

/** 单群单功能的权限与参数 */
export interface FeatureSettings {
    /** 该群是否启用该功能 */
    enabled: boolean;
    /** 是否允许群主 / 管理员使用该功能 */
    allow_group_admin: boolean;
    /** 允许使用该功能的成员名单（QQ 号字符串） */
    allowed_users: string[];
    /** 功能自身的参数（禁言时长、文案、关键词表等） */
    params: Record<string, unknown>;
}

/** 一条群配置：可绑定多个群 */
export interface GroupProfile {
    id: string;
    label: string;
    group_ids: string[];
    /** 功能卡片在 WebUI 里的显示顺序（WebUI 拖动排序后写入，缺省按内置顺序） */
    feature_order?: string[];
    features: Record<string, FeatureSettings>;
}

/** 全局配置（对应 WebUI 配置面板） */
export interface GlobalConfig {
    /** 插件总开关 */
    enabled: boolean;
    /** 调试日志 */
    debug: boolean;
    /** 命令前缀 */
    command_prefix: string;
    /** Bot 管理员（全局最高权限） */
    global_admins: string[];
    /** 通用提示文案（无权限 / 仅群聊 等），key 见 GLOBAL_TEXT_DEFAULTS */
    texts?: Record<string, string>;
    /** 插件页面的访问密码（在 NapCat 插件配置里设置）；留空表示不校验 */
    webui_password?: string;
}

/** 落盘结构：dataPath/config.json */
export interface PluginStore {
    global: GlobalConfig;
    profiles: GroupProfile[];
}

/* ---------------- 参数元信息（用于 WebUI 自动渲染） ---------------- */

export type ParamType =
    | 'boolean'
    | 'number'
    | 'text'
    | 'password'
    | 'textarea'
    | 'numberlist'
    | 'wordlists'
    | 'grouplist'
    | 'select';

export interface WordListMeta {
    key: string;
    label: string;
}

/** type = select 时的候选项 */
export interface ParamOption {
    value: string;
    label: string;
}

export interface ParamMeta {
    key: string;
    label: string;
    type: ParamType;
    default: unknown;
    hint?: string;
    /** WebUI 参数区分组名（缺省归入「参数」） */
    group?: string;
    /** type = wordlists 时，子词表定义 */
    subKeys?: WordListMeta[];
    /** type = select 时，候选项 */
    options?: ParamOption[];
    /**
     * 渲染位置：'permission' 表示该参数不是普通参数，
     * 而是和「允许群主/ 管理员」「成员名单」放在一起（WebUI 的「使用权限」区）
     */
    slot?: 'permission';
}

/** 参数区下方的操作按钮（如「测试 API Key」） */
export interface FeatureAction {
    /** 前端按此分发具体行为 */
    key: string;
    label: string;
}

/** 功能元信息（前后端共用） */
export interface FeatureMeta {
    key: FeatureKey;
    label: string;
    /** 用法说明 */
    usage: string;
    /** 该功能是否会与本插件其它功能抢同一条消息 */
    block: boolean;
    /** 是否已实现（未实现的在 WebUI 上标注「开发中」） */
    implemented: boolean;
    params: ParamMeta[];
    /** 参数区底部的操作按钮 */
    actions?: FeatureAction[];
    /**
     * 操作按钮归属的参数分组名；缺省时按钮渲染在参数区底部。
     * 例：加群审核把「测试 API Key」放进「AI 判断」分组内
     */
    actionGroup?: string;
}

/* ---------------- OneBot 事件（宽松类型，只声明本插件用到的字段） ---------------- */

export interface MessageSegmentLike {
    type: string;
    data: Record<string, any>;
}

export interface RawEventLike {
    post_type?: string;
    time?: number;
    self_id?: number;

    /* 消息事件 */
    message_type?: 'group' | 'private';
    message_id?: number;
    user_id?: number | string;
    group_id?: number | string;
    raw_message?: string;
    message?: MessageSegmentLike[] | string;
    sender?: {
        user_id?: number | string;
        nickname?: string;
        card?: string;
        role?: string;
    };

    /* 通知事件 */
    notice_type?: string;
    operator_id?: number;
    duration?: number;

    /* 请求事件 */
    request_type?: string;
    sub_type?: string;
    comment?: string;
    flag?: string;
}

/** 命令上下文 */
export interface CommandContext {
    event: RawEventLike;
    /** 群号（群聊）或 0（私聊） */
    groupId: number;
    userId: number;
    /** owner / admin / member */
    role: string;
    /** 触发用的命令名 */
    command: string;
    /** 命令后的参数（按空格切分，已剔除命令名） */
    argv: string[];
    /** 命令后的原始文本 */
    argText: string;
    /** 消息中的 @ 目标 */
    atTargets: string[];
    /** 整条消息的纯文本 */
    plainText: string;
}

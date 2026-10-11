/**
 * WebUI 前端类型：与后端 src/types.ts、src/services/api-service.ts 的契约保持一致。
 */

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

/** type = 'select' 时的候选项 */
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
    /** 参数区分组名（缺省归入「参数」） */
    group?: string;
    /** type = wordlists 时的子词表定义 */
    subKeys?: WordListMeta[];
    /** type = select 时的候选项 */
    options?: ParamOption[];
    /** 渲染到「使用权限」区的参数（slot = 'permission'） */
    slot?: 'permission';
}

export interface FeatureAction {
    key: string;
    label: string;
}

export interface FeatureMeta {
    key: string;
    label: string;
    usage: string;
    block: boolean;
    implemented: boolean;
    params: ParamMeta[];
    actions?: FeatureAction[];
    /** 操作按钮归属的参数分组名；缺省时渲染在参数区底部 */
    actionGroup?: string;
}

/** GET /meta */
export interface MetaResponse {
    features: FeatureMeta[];
    featureKeys: string[];
    defaultGlobal: Record<string, unknown>;
    defaultWords: Record<string, unknown>;
}

export interface FeatureSettings {
    enabled: boolean;
    allow_group_admin: boolean;
    allowed_users: string[];
    params: Record<string, unknown>;
}

export interface GroupProfile {
    id: string;
    label: string;
    group_ids: string[];
    feature_order?: string[];
    features: Record<string, FeatureSettings>;
}

export interface GlobalConfig {
    enabled?: boolean;
    debug?: boolean;
    command_prefix?: string;
    global_admins?: string[];
    texts?: Record<string, string>;
    /** 后端其它字段（页面不编辑），保留以便原样回传 */
    [key: string]: unknown;
}

/** GET /duplicates/snapshot */
export interface DupSnapshotInfo {
    exists: boolean;
    updatedAt: number;
    groups: number;
    members: number;
    stale: boolean;
    /** 快照里记录了成员名单的群号 */
    groupIds: string[];
    /** 快照里记录到的群名（群号 → 群名） */
    groupNames: Record<string, string>;
}

/** POST /duplicates/export */
export interface DupExportResult {
    groups: number;
    members: number;
    failed: { groupId: string; error: string }[];
    snapshot: DupSnapshotInfo;
}

/** GET /groups */
export interface GroupInfo {
    group_id: string;
    group_name: string;
    member_count: number;
    profileId: string | null;
    enabledFeatures: string[];
}

/** GET /friends */
export interface FriendInfo {
    user_id: string;
    /** 好友昵称 */
    nickname: string;
    /** 好友备注；展示时优先于昵称 */
    remark: string;
}

/* ---------------- 群数据（GET /data/*） ---------------- */

/** 禁言记录：退群重进「重新禁言」保留的时长 */
export interface BanRecordRow {
    groupId: string;
    userId: string;
    /** 保留的禁言时长（秒） */
    duration: number;
    /** 禁言开始时间戳（秒） */
    banTime: number;
    /** 剩余保留时长（秒） */
    remaining: number;
    /** 是否已退群；undefined = 无法判断（老数据 / 没收到退群通知） */
    left?: boolean;
}

/** 黑历史列表项（正文已拼成纯文本） */
export interface BlackRecordRow {
    id: number;
    userId: number;
    /** 所属群号；空字符串 = 老数据没有记录群 */
    groupId: string;
    text: string;
}



/** 一条撤回明细 */
export interface RecallEntryRow {
    operatorId: number;
    operatorName: string;
    message: string;
    timestamp: number;
}

/** 撤回记录列表项：一条 = 某群某个被撤回消息的人 */
export interface RecallRow {
    groupId: string;
    userId: string;
    count: number;
    /** 最近一次被撤回的时间戳（秒） */
    lastAt: number;
    records: RecallEntryRow[];
}

/** GET /status */
export interface StatusInfo {
    pluginName: string;
    version: string;
    uptime: string;
    /** 运行秒数，前端据此本地走秒（旧后端可能不返回） */
    uptimeSeconds?: number;
    dataPath: string;
    stats: {
        messageReceived: number;
        commandHandled: number;
        eventHandled: number;
        errors: number;
    };
    global: GlobalConfig;
    summary: {
        profiles: number;
        groups: number;
        files: number;
    };
}

/** POST /ai/test */
export interface AiTestResult {
    ok: boolean;
    reply: string;
    verdict: boolean | null;
}

/** GET /errors 的一条错误记录 */
export interface ErrorRecord {
    time: string;
    /** 记录产生时的插件启动时间戳；旧日志行没有该字段 */
    boot?: number;
    source: string;
    command: string;
    feature: string;
    groupId: string;
    userId: string;
    /** 触发者昵称；旧日志行没有该字段 */
    userName?: string;
    message: string;
}

/** GET /activity：一条功能调用记录 */
export interface ActivityRecord {
    time: string;
    /** 记录产生时的插件启动时间戳；旧日志行没有该字段 */
    boot?: number;
    /** 调用来源：命令 / 事件 / 接口 */
    source: 'command' | 'event' | 'api' | string;
    /** 命令名或事件类型，如 ban / notice:group_ban */
    action: string;
    /** 所属功能；system 表示系统级 */
    feature: string;
    groupId: string;
    /** 触发者 QQ */
    userId: string;
    /** 触发者昵称；旧日志行没有该字段 */
    userName?: string;
    /** 触发内容：用户消息原文 / 事件摘要 */
    input: string;
    /** 机器人发出的内容，多条用 ⏎ 连接 */
    sent: string;
    result: 'ok' | 'fail' | 'reject' | string;
    /** 结果说明（失败 / 拒绝原因） */
    note: string;
}

export type ToastKind = 'ok' | 'err';

export interface ToastItem {
    id: number;
    message: string;
    kind: ToastKind;
    /** 正在播放退场动画，动画播完后由 store 真正移除 */
    leaving?: boolean;
}

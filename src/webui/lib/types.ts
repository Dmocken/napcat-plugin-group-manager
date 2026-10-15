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
    | 'select'
    | 'cascade';

export interface WordListMeta {
    key: string;
    label: string;
}

/** type = 'select' 时的候选项 */
export interface ParamOption {
    value: string;
    label: string;
}

/** 文案里可用的占位符（由后端 meta 带过来，汇总显示在「提示文案」底部） */
export interface TextVarMeta {
    /** 占位符名，渲染成 {name} */
    name: string;
    /** 一句话说明；空串表示没有说明 */
    desc: string;
}

export interface ParamMeta {
    key: string;
    label: string;
    type: ParamType;
    default: unknown;
    hint?: string;
    /** 「提示文案」参数支持的占位符 */
    vars?: TextVarMeta[];
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

/* ---------------- 群发消息（POST /send） ---------------- */

/** 一次群发的请求参数 */
export interface SendPayload {
    /** 目标群号（不设上限，后端按间隔串行发送） */
    groups: string[];
    /** 正文（纯文本） */
    text: string;
    /** @全体成员 */
    atAll?: boolean;
    /** 群间随机间隔下限（秒） */
    gapMin?: number;
    /** 群间随机间隔上限（秒） */
    gapMax?: number;
}

/** 一次群发的结果 */
export interface SendResult {
    /** 目标群总数 */
    total: number;
    /** 发送成功的群数 */
    ok: number;
    /** 发送失败的群与原因 */
    failed: { groupId: string; error: string }[];
}

/* ---------------- 群数据（GET /data/*） ---------------- */

/** 禁言记录：退群重进「重新禁言」保留的时长 */
export interface BanRecordRow {
    groupId: string;
    userId: string;
    /** 保留的禁言时长（秒） */
    duration: number;
    /** 禁言开始时间戳（秒，服务端时间轴） */
    banTime: number;
    /**
     * 服务端算出的剩余保留时长（秒）。
     *
     * 页面不再使用它做展示 —— 「已禁言 / 剩余 / 解禁时间」一律由 banTime + duration
     * 在服务端时间轴上现算（见 lib/server-clock.ts），只有「服务端相对量 + 本地流逝」
     * 混着用才会出现 5s 轮询时的跳变。这里保留字段供接口自检 / 兼容。
     */
    remaining: number;
    /** 是否已退群；undefined = 无法判断（老数据 / 没收到退群通知） */
    left?: boolean;
    /** 禁言时反查到的昵称；没有时前端退回好友列表 / 只显示号码 */
    userName?: string;
    /** false = 这条禁言不参与「退群重进重新禁言」（sm / smplus） */
    remute?: boolean;
}

/**
 * sm / smplus 禁言统计的一条（GET /data/sm-stats）
 *
 * 按 QQ 跨群聚合，不含群号与配置组；只有开了「禁言时长统计」的群才会记录。
 */
export interface SmStatRow {
    userId: string;
    /** 被禁言次数 */
    count: number;
    /** 累计被禁言秒数（看板按它降序） */
    total: number;
    /** 最长一次的禁言秒数 */
    longest: number;
    /** 最长那一次的时间戳（秒） */
    longestAt: number;
    /** 禁言时反查到的群名片；没有时前端退回好友列表 / 只显示号码 */
    name?: string;
}

/**
 * 拉黑名单的一条（GET /data/blacklist）
 *
 * 按配置组聚合：在组内任何一群拉黑，组内所有群的入群申请都会被拦截。
 */
export interface BlacklistRow {
    /** 所属配置组 id；名称用群配置里的 label 反查 */
    profileId: string;
    userId: string;
    /** 拉黑时间戳（秒） */
    at: number;
    /** 执行拉黑的人 */
    by: number;
    /** 拉黑时反查到的昵称；没有时前端退回好友列表 / 只显示号码 */
    name?: string;
    /** 拉黑原因；没有时为空 */
    reason?: string;
}

/** 群主 / 管理员（GET /group/managers，AI 失败通知对象级联菜单的右侧列表用） */
export interface ManagerUser {
    userId: string;
    /** 群名片，没有时为昵称；再没有就只显示号码 */
    name?: string;
}

export interface GroupManagers {
    groupId: string;
    /** 群主；取不到时为 null */
    owner: ManagerUser | null;
    /** 管理员们 */
    admins: ManagerUser[];
    /** 本地记录最后更新的时间戳（实时拉取 = 拉取完成时间） */
    updatedAt?: number;
    /** true = 本次直接命中后端本地记录，没有重新拉取 */
    cached?: boolean;
    /** 拉取失败的原因（bot 不在群里 / 接口异常）；有值时 owner / admins 为空 */
    error?: string;
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
    /** 被撤回人的昵称；没有时前端退回好友列表 / 只显示号码 */
    userName?: string;
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
    /**
     * 取 uptimeSeconds 那一刻的服务端时间（**毫秒**时间戳），
     * 用于把运行时长算在服务端时间轴上（见 lib/server-clock.ts）
     */
    serverTime?: number;
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

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

/** GET /status */
export interface StatusInfo {
    pluginName: string;
    version: string;
    uptime: string;
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
    message: string;
}

export type ToastKind = 'ok' | 'err';

export interface ToastItem {
    id: number;
    message: string;
    kind: ToastKind;
}

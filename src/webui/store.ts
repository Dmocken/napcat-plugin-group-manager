import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { NeedPasswordError, downloadFile, request } from '@/lib/api';
import { TEXT_FIELDS } from '@/lib/constants';
import { featureOrder, newProfile, normalizeProfile } from '@/lib/profile';
import { isQq } from '@/lib/utils';
import type {
    ActivityRecord,
    BanRecordRow,
    BlackRecordRow,
    DupExportResult,
    DupSnapshotInfo,
    ErrorRecord,
    FeatureSettings,
    FriendInfo,
    GlobalConfig,
    GroupInfo,
    GroupProfile,
    MetaResponse,
    RecallRow,
    SendPayload,
    SmStatRow,
    SendResult,
    StatusInfo,
    ToastItem,
    ToastKind,
} from '@/lib/types';

/** 左侧导航的页面 */
export type PageKey = 'overview' | 'global' | 'profiles' | 'data' | 'broadcast';

/** 可导出 / 清空的日志文件 */
export type LogTarget = 'errors' | 'activity';

/** 日志文件名（界面提示与下载文件名共用） */
const LOG_FILE_NAME: Record<LogTarget, string> = {
    errors: 'errors.log',
    activity: 'activity.log',
};

interface ConfirmState {
    title: string;
    text: string;
    tone: 'default' | 'danger';
    resolve: (ok: boolean) => void;
}

/** 「发送消息」页的编辑草稿：只存在内存里，切到别的页面再回来内容还在 */
export interface BroadcastDraft {
    /** 已勾选的群号 */
    groups: string[];
    /** 群列表的搜索关键字 */
    keyword: string;
    content: string;
    atAll: boolean;
    /** 群间随机间隔（秒），输入框里是字符串，发出去前再解析 */
    gapMin: string;
    gapMax: string;
}

const EMPTY_BROADCAST: BroadcastDraft = {
    groups: [],
    keyword: '',
    content: '',
    atAll: false,
    gapMin: '1',
    gapMax: '3',
};

interface StoreState {
    meta: MetaResponse | null;
    global: GlobalConfig;
    profiles: GroupProfile[];
    groups: GroupInfo[];
    /** bot 好友列表（用于管理员昵称展示与从好友选择） */
    friends: FriendInfo[];
    status: StatusInfo | null;
    dirty: boolean;
    /** 首次加载中（用于骨架屏） */
    loading: boolean;
    /** 保存中（顶栏按钮转圈） */
    saving: boolean;
    lastSavedAt: string | null;
    /** 顶部内联错误条，保存 / 加载失败时常驻，直到用户关闭或重试成功 */
    errorBanner: string | null;
    /** 最近的错误记录（后端保留 50 条并写入 errors.log） */
    errors: ErrorRecord[];
    /** 后端本次启动的时间戳，用于区分本次 / 历史记录 */
    errorsBootAt: number | null;
    /** 最近的功能调用记录（后端保留 50 条并写入 activity.log） */
    activities: ActivityRecord[];
    /** 调用日志对应的后端启动时间戳 */
    activitiesBootAt: number | null;
    /** 群成员快照信息（重复加群检测用） */
    dupSnapshot: DupSnapshotInfo | null;

    /* ---------------- 群数据（「群数据」页） ---------------- */
    /** 禁言记录：退群重进「重新禁言」保留的时长 */
    banRecords: BanRecordRow[];
    /** 黑历史 */
    blackHistory: BlackRecordRow[];
    /** 撤回记录 */
    recallRecords: RecallRow[];
    /** 群数据加载中 */
    groupDataLoading: boolean;
    /** sm / smplus 禁言统计（跨群按 QQ 聚合，按累计时长降序） */
    smStats: SmStatRow[];
    /** 禁言统计加载中 */
    smStatsLoading: boolean;

    page: PageKey;
    setPage: (page: PageKey) => void;

    activeProfileId: string | null;
    setActiveProfileId: (id: string) => void;

    /** 功能折叠状态，key = `${profileId}|${featureKey}` */
    collapsed: Record<string, boolean>;
    toasts: ToastItem[];
    confirmState: ConfirmState | null;
    passwordOpen: boolean;

    load: () => Promise<void>;
    refreshStatus: () => Promise<void>;
    refreshErrors: () => Promise<void>;
    refreshActivities: () => Promise<void>;
    /** 下载原始日志文件（errors.log / activity.log） */
    downloadLog: (target: LogTarget) => Promise<void>;
    /** 二次确认后清空日志；清 errors 时本次运行的异常计数一并归零 */
    clearLog: (target: LogTarget) => Promise<void>;
    save: () => Promise<void>;
    handleError: (error: unknown, prefix?: string) => void;
    clearError: () => void;

    patchGlobal: (patch: Partial<GlobalConfig>) => void;
    setText: (key: string, value: string) => void;
    addAdmin: (qq: string) => void;
    removeAdmin: (index: number) => void;
    /** 刷新快照信息 */
    refreshDupSnapshot: () => Promise<void>;
    /** 导出选中群的成员快照 */
    exportDupSnapshot: (groupIds: string[]) => Promise<DupExportResult | null>;
    /** 下载当前快照文件到本地（备份 / 换机迁移） */
    downloadDupSnapshot: () => Promise<void>;
    /** 导入快照文件内容（覆盖当前快照，可为 bot 不在的群补充名单） */
    importDupSnapshot: (content: string) => Promise<void>;
    /** 清理快照文件 */
    clearDupSnapshot: () => Promise<boolean>;

    /* ---------------- 群数据 ---------------- */

    /** 拉取禁言记录 / 黑历史 / 撤回记录；silent = 后台轮询，不转圈也不弹错误提示 */
    loadGroupData: (options?: { silent?: boolean }) => Promise<void>;
    /** 修改禁言保留时长（秒）；失败时已自动提示 */
    updateBanDuration: (groupId: string, userId: string, duration: number) => Promise<void>;
    /** 删除单条禁言记录（成员已退群时用） */
    removeBanRecordRow: (groupId: string, userId: string) => Promise<void>;
    /** 解除该成员在本群的禁言并删掉记录（成员在群里时用，不发群消息） */
    unbanMember: (groupId: string, userId: string) => Promise<void>;
    /** 清空禁言记录：传群号只清该群，不传全清 */
    clearBanRecordRows: (groupId?: string) => Promise<void>;
    /** 拉取 sm / smplus 禁言统计（不参与 5s 轮询，数据不会自己走动） */
    loadSmStats: () => Promise<void>;
    /** 删除某个用户的禁言统计 */
    removeSmStat: (userId: string) => Promise<void>;
    /** 把一条禁言记录迁移到另一个群 */
    migrateBanRecord: (groupId: string, userId: string, targetGroupId: string) => Promise<void>;
    /** 把某人的撤回记录迁移到另一个群 */
    migrateRecallRow: (groupId: string, userId: string, targetGroupId: string) => Promise<void>;
    /** 新增黑历史（groupId 为空表示不指定群） */
    addBlackRecord: (userId: string, text: string, groupId?: string) => Promise<void>;
    /** 修改黑历史（QQ 号 / 正文 / 所属群） */
    updateBlackRecord: (
        id: number,
        patch: { userId?: string; text?: string; groupId?: string },
    ) => Promise<void>;
    /** 按编号删除黑历史 */
    removeBlackRecords: (ids: number[]) => Promise<void>;

    /* ---------------- 群发消息（「发送消息」页） ---------------- */
    broadcastDraft: BroadcastDraft;
    /** 正在群发：切走页面再回来按钮仍在转圈，也不会被重复点一次 */
    broadcasting: boolean;
    /** 上一次群发的结果 */
    broadcastResult: SendResult | null;
    /** 修改草稿（不置 dirty，草稿不参与「保存全部配置」） */
    patchBroadcast: (patch: Partial<BroadcastDraft>) => void;
    /** 群发纯文本；返回逐群结果，null 表示整轮没发出去 */
    sendBroadcast: (payload: SendPayload) => Promise<SendResult | null>;
    /** 清空黑历史 */
    clearBlackHistory: () => Promise<void>;
    /** 删除某群某人的撤回记录 */
    removeRecallRow: (groupId: string, userId: string) => Promise<void>;
    /** 清空撤回记录：传群号只清该群，不传全清 */
    clearRecallRows: (groupId?: string) => Promise<void>;

    addProfile: () => void;
    removeProfile: (profileId: string) => void;
    setProfileLabel: (profileId: string, label: string) => void;
    toggleGroup: (profileId: string, groupId: string) => void;
    removeGroup: (profileId: string, groupId: string) => void;
    reorderFeature: (profileId: string, fromKey: string, toKey: string) => void;
    updateFeature: (
        profileId: string,
        featureKey: string,
        updater: (settings: FeatureSettings) => void,
    ) => void;
    /** 概览页功能矩阵：切换某个群所在配置里的某个功能开关 */
    toggleGroupFeature: (groupId: string, featureKey: string) => void;

    setCollapsed: (key: string, value: boolean) => void;
    setProfileCollapsedAll: (
        profileId: string,
        value: boolean,
        section: 'features' | 'texts',
    ) => void;

    toast: (message: string, kind?: ToastKind) => void;
    dismissToast: (id: number) => void;
    askConfirm: (title: string, text: string, tone?: 'default' | 'danger') => Promise<boolean>;
    resolveConfirm: (ok: boolean) => void;
    setPasswordOpen: (open: boolean) => void;
}

let toastSeq = 0;

/** 提示窗停留时长（毫秒） */
const TOAST_LIFE = 2600;
/** 退场动画时长，与 styles.css 里的 gm-toast-out 保持一致 */
const TOAST_EXIT = 200;

const nowText = (): string =>
    new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });

export const useStore = create<StoreState>()(
    immer((set, get) => ({
        meta: null,
        global: {},
        profiles: [],
        groups: [],
        friends: [],
        status: null,
        dirty: false,
        loading: false,
        saving: false,
        lastSavedAt: null,
        errorBanner: null,
        errors: [],
        errorsBootAt: null,
        activities: [],
        activitiesBootAt: null,
        dupSnapshot: null,
        banRecords: [],
        blackHistory: [],
        recallRecords: [],
        groupDataLoading: false,
        smStats: [],
        smStatsLoading: false,
        broadcastDraft: { ...EMPTY_BROADCAST },
        broadcasting: false,
        broadcastResult: null,

        page: 'overview',
        activeProfileId: null,

        collapsed: {},
        toasts: [],
        confirmState: null,
        passwordOpen: false,

        /* ---------------- 导航 ---------------- */

        setPage: (page) =>
            set((draft) => {
                draft.page = page;
            }),

        setActiveProfileId: (id) =>
            set((draft) => {
                draft.activeProfileId = id;
            }),

        /* ---------------- 加载 / 保存 ---------------- */

        load: async () => {
            set((draft) => {
                draft.loading = true;
            });
            try {
                const [meta, global, profiles, groups, friends] = await Promise.all([
                    request<MetaResponse>('/meta'),
                    request<GlobalConfig>('/config'),
                    request<GroupProfile[]>('/profiles'),
                    request<GroupInfo[]>('/groups').catch(() => [] as GroupInfo[]),
                    request<FriendInfo[]>('/friends').catch(() => [] as FriendInfo[]),
                ]);
                void get().refreshErrors();
                void get().refreshActivities();
                void get().refreshDupSnapshot();

                set((draft) => {
                    draft.meta = meta;
                    draft.global = { ...(global ?? {}) };
                    if (!Array.isArray(draft.global.global_admins)) draft.global.global_admins = [];
                    if (!draft.global.texts || typeof draft.global.texts !== 'object') {
                        draft.global.texts = {};
                    }
                    draft.profiles = (Array.isArray(profiles) ? profiles : []).map((p) =>
                        normalizeProfile(p, meta),
                    );
                    draft.groups = Array.isArray(groups) ? groups : [];
                    draft.friends = Array.isArray(friends) ? friends : [];
                    draft.dirty = false;
                    draft.errorBanner = null;
                    // 默认选中第一条配置，避免详情区空白
                    const stillThere = draft.profiles.some((p) => p.id === draft.activeProfileId);
                    if (!stillThere) draft.activeProfileId = draft.profiles[0]?.id ?? null;
                });

                void get().refreshStatus();
            } catch (error) {
                get().handleError(error, '加载失败：');
                if (!(error instanceof NeedPasswordError)) {
                    set((draft) => {
                        draft.errorBanner = `加载配置失败：${
                            error instanceof Error ? error.message : '未知错误'
                        }`;
                    });
                }
            } finally {
                set((draft) => {
                    draft.loading = false;
                });
            }
        },

        refreshStatus: async () => {
            try {
                const status = await request<StatusInfo>('/status');
                set((draft) => {
                    draft.status = status;
                });
            } catch {
                /* 状态刷新失败不打扰用户，页面主体数据已足够 */
            }
        },

        refreshErrors: async () => {
            try {
                const data = await request<{ records: ErrorRecord[]; startedAt: number }>('/errors');
                set((draft) => {
                    draft.errors = data?.records ?? [];
                    draft.errorsBootAt = typeof data?.startedAt === 'number' ? data.startedAt : null;
                });
            } catch {
                /* 错误记录读取失败不影响主流程 */
            }
        },

        refreshActivities: async () => {
            try {
                const data = await request<{ records: ActivityRecord[]; startedAt: number }>(
                    '/activity',
                );
                set((draft) => {
                    draft.activities = data?.records ?? [];
                    draft.activitiesBootAt =
                        typeof data?.startedAt === 'number' ? data.startedAt : null;
                });
            } catch {
                /* 调用日志读取失败不影响主流程 */
            }
        },

        downloadLog: async (target) => {
            const file = LOG_FILE_NAME[target];
            try {
                await downloadFile(`/logs/file?name=${target}`, file);
                get().toast(`已下载 ${file}`);
            } catch (error) {
                get().handleError(error, '下载失败：');
            }
        },

        clearLog: async (target) => {
            const isErrors = target === 'errors';
            const file = LOG_FILE_NAME[target];
            const ok = await get().askConfirm(
                isErrors ? '清空异常记录' : '清空调用日志',
                `确定清空 data/${file}？\n` +
                    (isErrors
                        ? '本次运行的「异常次数」会一并归零，清空后无法恢复。'
                        : '清空后无法恢复，建议先「下载日志」留档。'),
                'danger',
            );
            if (!ok) return;

            try {
                await request('/logs/clear', { method: 'POST', body: { target } });
                if (isErrors) {
                    // 异常计数已归零，连 /status 一起刷新，概览与侧栏同步
                    await Promise.all([get().refreshErrors(), get().refreshStatus()]);
                } else {
                    await get().refreshActivities();
                }
                get().toast(isErrors ? '异常记录已清空' : '调用日志已清空');
            } catch (error) {
                get().handleError(error, '清空失败：');
            }
        },

        save: async () => {
            const { global, profiles, meta } = get();
            const texts: Record<string, string> = {};
            TEXT_FIELDS.forEach((field) => {
                const value = (global.texts?.[field.key] ?? '').trim();
                if (value) texts[field.key] = value;
            });

            const payload = {
                enabled: global.enabled !== false,
                debug: global.debug === true,
                command_prefix: (global.command_prefix ?? '/').trim() || '/',
                global_admins: global.global_admins ?? [],
                texts,
            };

            set((draft) => {
                draft.saving = true;
            });
            try {
                await request('/config', { method: 'POST', body: payload });
                const saved = await request<GroupProfile[]>('/profiles', {
                    method: 'POST',
                    body: { profiles },
                });

                set((draft) => {
                    draft.global = { ...draft.global, ...payload };
                    draft.profiles = (Array.isArray(saved) ? saved : []).map((p) =>
                        meta ? normalizeProfile(p, meta) : (p as GroupProfile),
                    );
                    draft.dirty = false;
                    draft.errorBanner = null;
                    draft.lastSavedAt = nowText();
                    const stillThere = draft.profiles.some((p) => p.id === draft.activeProfileId);
                    if (!stillThere) draft.activeProfileId = draft.profiles[0]?.id ?? null;
                });

                void get().refreshStatus();
                get().toast('配置已保存');
            } catch (error) {
                get().handleError(error, '保存失败：');
                if (!(error instanceof NeedPasswordError)) {
                    set((draft) => {
                        draft.errorBanner = `保存失败：${
                            error instanceof Error ? error.message : '未知错误'
                        }`;
                    });
                }
            } finally {
                set((draft) => {
                    draft.saving = false;
                });
            }
        },

        handleError: (error, prefix = '') => {
            if (error instanceof NeedPasswordError) {
                set((draft) => {
                    draft.passwordOpen = true;
                });
                return;
            }
            const message = error instanceof Error ? error.message : '未知错误';
            get().toast(prefix + message, 'err');
        },

        clearError: () =>
            set((draft) => {
                draft.errorBanner = null;
            }),

        /* ---------------- 全局配置 ---------------- */

        patchGlobal: (patch) =>
            set((draft) => {
                Object.assign(draft.global, patch);
                draft.dirty = true;
            }),

        setText: (key, value) =>
            set((draft) => {
                if (!draft.global.texts) draft.global.texts = {};
                draft.global.texts[key] = value;
                draft.dirty = true;
            }),

        addAdmin: (qq) => {
            if (!isQq(qq)) {
                get().toast('请输入正确的 QQ 号', 'err');
                return;
            }
            if ((get().global.global_admins ?? []).includes(qq)) {
                get().toast('该管理员已存在');
                return;
            }
            set((draft) => {
                if (!Array.isArray(draft.global.global_admins)) draft.global.global_admins = [];
                draft.global.global_admins.push(qq);
                draft.dirty = true;
            });
        },

        removeAdmin: (index) =>
            set((draft) => {
                draft.global.global_admins?.splice(index, 1);
                draft.dirty = true;
            }),

        refreshDupSnapshot: async () => {
            try {
                const data = await request<DupSnapshotInfo>('/duplicates/snapshot');
                set((draft) => {
                    draft.dupSnapshot = data ?? null;
                });
            } catch {
                /* 快照信息读取失败不影响主流程 */
            }
        },

        exportDupSnapshot: async (groupIds) => {
            const groups = (groupIds ?? []).map(String).filter(Boolean);
            if (!groups.length) {
                get().toast('请先选择要导出的群', 'err');
                return null;
            }
            try {
                const data = await request<DupExportResult>('/duplicates/export', {
                    method: 'POST',
                    body: { groupIds: groups },
                });
                set((draft) => {
                    draft.dupSnapshot = data?.snapshot ?? null;
                });
                return data ?? null;
            } catch (error) {
                get().handleError(error, '导出失败：');
                return null;
            }
        },

        downloadDupSnapshot: async () => {
            try {
                await downloadFile('/duplicates/snapshot/file', 'dup_snapshot.json');
                get().toast('快照已下载');
            } catch (error) {
                get().handleError(error, '下载失败：');
            }
        },

        importDupSnapshot: async (content: string) => {
            try {
                const data = await request<{
                    groups: number;
                    members: number;
                    snapshot: DupSnapshotInfo;
                }>('/duplicates/snapshot/import', {
                    method: 'POST',
                    body: { content },
                });
                set((draft) => {
                    draft.dupSnapshot = data?.snapshot ?? null;
                });
                get().toast(`已导入 ${data?.groups ?? 0} 个群 / ${data?.members ?? 0} 名成员`);
            } catch (error) {
                get().handleError(error, '导入失败：');
            }
        },

        clearDupSnapshot: async () => {
            try {
                const data = await request<{ cleared: boolean; snapshot: DupSnapshotInfo }>(
                    '/duplicates/snapshot/clear',
                    { method: 'POST' },
                );
                set((draft) => {
                    draft.dupSnapshot = data?.snapshot ?? null;
                });
                get().toast(data?.cleared ? '快照已清理' : '没有需要清理的文件');
                return Boolean(data?.cleared);
            } catch (error) {
                get().handleError(error, '清理失败：');
                return false;
            }
        },

        /* ---------------- 群发消息 ---------------- */

        patchBroadcast: (patch) =>
            set((draft) => {
                Object.assign(draft.broadcastDraft, patch);
            }),

        sendBroadcast: async (payload) => {
            if (get().broadcasting) {
                get().toast('上一轮群发还没发完，请稍候', 'err');
                return null;
            }
            set((draft) => {
                draft.broadcasting = true;
                draft.broadcastResult = null;
            });
            try {
                const data = await request<SendResult>('/send', { method: 'POST', body: payload });
                set((draft) => {
                    draft.broadcastResult = data ?? null;
                });
                // 整轮只落一条调用日志，发完立刻刷新一次让面板看到
                void get().refreshActivities();
                return data ?? null;
            } catch (error) {
                get().handleError(error, '发送失败：');
                return null;
            } finally {
                set((draft) => {
                    draft.broadcasting = false;
                });
            }
        },

        /* ---------------- 群数据 ---------------- */

        loadGroupData: async (options) => {
            const silent = options?.silent === true;
            if (!silent) {
                set((draft) => {
                    draft.groupDataLoading = true;
                });
            }
            try {
                const [ban, black, recall] = await Promise.all([
                    request<{ records: BanRecordRow[] }>('/data/ban-records').catch(() => ({
                        records: [] as BanRecordRow[],
                    })),
                    request<{ records: BlackRecordRow[] }>('/data/black-history').catch(() => ({
                        records: [] as BlackRecordRow[],
                    })),
                    request<{ records: RecallRow[] }>('/data/recall-records').catch(() => ({
                        records: [] as RecallRow[],
                    })),
                ]);
                set((draft) => {
                    draft.banRecords = ban?.records ?? [];
                    draft.blackHistory = black?.records ?? [];
                    draft.recallRecords = recall?.records ?? [];
                });
            } catch (error) {
                // 后台轮询失败不打扰用户（需要密码时照常弹框）
                if (silent && !(error instanceof NeedPasswordError)) return;
                get().handleError(error, '读取群数据失败：');
            } finally {
                if (!silent) {
                    set((draft) => {
                        draft.groupDataLoading = false;
                    });
                }
            }
        },

        migrateBanRecord: async (groupId, userId, targetGroupId) => {
            try {
                const data = await request<{ records: BanRecordRow[] }>('/data/ban-records/migrate', {
                    method: 'POST',
                    body: { groupId, userId, targetGroupId },
                });
                set((draft) => {
                    draft.banRecords = data?.records ?? [];
                });
                get().toast(`已迁移到群 ${targetGroupId}`);
            } catch (error) {
                get().handleError(error, '迁移失败：');
            }
        },

        migrateRecallRow: async (groupId, userId, targetGroupId) => {
            try {
                const data = await request<{ records: RecallRow[] }>(
                    '/data/recall-records/migrate',
                    { method: 'POST', body: { groupId, userId, targetGroupId } },
                );
                set((draft) => {
                    draft.recallRecords = data?.records ?? [];
                });
                get().toast(`已迁移到群 ${targetGroupId}`);
            } catch (error) {
                get().handleError(error, '迁移失败：');
            }
        },

        updateBanDuration: async (groupId, userId, duration) => {
            try {
                const data = await request<{ records: BanRecordRow[] }>('/data/ban-records/update', {
                    method: 'POST',
                    body: { groupId, userId, duration },
                });
                set((draft) => {
                    draft.banRecords = data?.records ?? [];
                });
                get().toast('已更新保留时长');
            } catch (error) {
                get().handleError(error, '更新失败：');
            }
        },

        removeBanRecordRow: async (groupId, userId) => {
            try {
                const data = await request<{ records: BanRecordRow[] }>('/data/ban-records/remove', {
                    method: 'POST',
                    body: { groupId, userId },
                });
                set((draft) => {
                    draft.banRecords = data?.records ?? [];
                });
                get().toast('已删除该条禁言记录');
            } catch (error) {
                get().handleError(error, '删除失败：');
            }
        },

        unbanMember: async (groupId, userId) => {
            try {
                const data = await request<{ records: BanRecordRow[] }>('/data/ban-records/unban', {
                    method: 'POST',
                    body: { groupId, userId },
                });
                set((draft) => {
                    draft.banRecords = data?.records ?? [];
                });
                get().toast('已解除禁言并删除记录');
            } catch (error) {
                get().handleError(error, '解除禁言失败：');
            }
        },

        clearBanRecordRows: async (groupId) => {
            try {
                const data = await request<{ records: BanRecordRow[]; removed: number }>(
                    '/data/ban-records/clear',
                    { method: 'POST', body: groupId ? { groupId } : {} },
                );
                set((draft) => {
                    draft.banRecords = data?.records ?? [];
                });
                get().toast(`已清空 ${data?.removed ?? 0} 条禁言记录`);
            } catch (error) {
                get().handleError(error, '清空失败：');
            }
        },

        loadSmStats: async () => {
            set((draft) => {
                draft.smStatsLoading = true;
            });
            try {
                const data = await request<{ records: SmStatRow[] }>('/data/sm-stats');
                set((draft) => {
                    draft.smStats = data?.records ?? [];
                });
            } catch (error) {
                get().handleError(error, '读取禁言统计失败：');
            } finally {
                set((draft) => {
                    draft.smStatsLoading = false;
                });
            }
        },

        removeSmStat: async (userId) => {
            try {
                const data = await request<{ records: SmStatRow[] }>('/data/sm-stats/remove', {
                    method: 'POST',
                    body: { userId },
                });
                set((draft) => {
                    draft.smStats = data?.records ?? [];
                });
                get().toast('已删除该用户的禁言统计');
            } catch (error) {
                get().handleError(error, '删除失败：');
            }
        },

        addBlackRecord: async (userId, text, groupId) => {
            try {
                const data = await request<{ records: BlackRecordRow[]; id: number }>(
                    '/data/black-history/add',
                    { method: 'POST', body: { userId, text, groupId } },
                );
                set((draft) => {
                    draft.blackHistory = data?.records ?? [];
                });
                get().toast(`已新增黑历史 #${data?.id ?? ''}`);
            } catch (error) {
                get().handleError(error, '新增失败：');
            }
        },

        updateBlackRecord: async (id, patch) => {
            try {
                const data = await request<{ records: BlackRecordRow[] }>(
                    '/data/black-history/update',
                    { method: 'POST', body: { id, ...patch } },
                );
                set((draft) => {
                    draft.blackHistory = data?.records ?? [];
                });
                get().toast('已保存修改');
            } catch (error) {
                get().handleError(error, '保存失败：');
            }
        },

        removeBlackRecords: async (ids) => {
            try {
                const data = await request<{ records: BlackRecordRow[]; removed: number }>(
                    '/data/black-history/remove',
                    { method: 'POST', body: { ids } },
                );
                set((draft) => {
                    draft.blackHistory = data?.records ?? [];
                });
                get().toast(`已删除 ${data?.removed ?? 0} 条黑历史`);
            } catch (error) {
                get().handleError(error, '删除失败：');
            }
        },

        clearBlackHistory: async () => {
            try {
                const data = await request<{ records: BlackRecordRow[]; removed: number }>(
                    '/data/black-history/clear',
                    { method: 'POST' },
                );
                set((draft) => {
                    draft.blackHistory = data?.records ?? [];
                });
                get().toast(`已清空 ${data?.removed ?? 0} 条黑历史`);
            } catch (error) {
                get().handleError(error, '清空失败：');
            }
        },

        removeRecallRow: async (groupId, userId) => {
            try {
                const data = await request<{ records: RecallRow[] }>('/data/recall-records/remove', {
                    method: 'POST',
                    body: { groupId, userId },
                });
                set((draft) => {
                    draft.recallRecords = data?.records ?? [];
                });
                get().toast('已删除该成员的撤回记录');
            } catch (error) {
                get().handleError(error, '删除失败：');
            }
        },

        clearRecallRows: async (groupId) => {
            try {
                const data = await request<{ records: RecallRow[]; removed: number }>(
                    '/data/recall-records/clear',
                    { method: 'POST', body: groupId ? { groupId } : {} },
                );
                set((draft) => {
                    draft.recallRecords = data?.records ?? [];
                });
                get().toast(`已清空 ${data?.removed ?? 0} 条撤回记录`);
            } catch (error) {
                get().handleError(error, '清空失败：');
            }
        },

        /* ---------------- 群配置 ---------------- */

        addProfile: () => {
            const meta = get().meta;
            if (!meta) return;
            set((draft) => {
                const next = newProfile(meta);
                draft.profiles.push(next);
                draft.activeProfileId = next.id;
                draft.dirty = true;
            });
            get().toast('已新增一条群配置，记得绑定群并保存');
        },

        removeProfile: (profileId) => {
            set((draft) => {
                const index = draft.profiles.findIndex((p) => p.id === profileId);
                if (index >= 0) draft.profiles.splice(index, 1);
                if (draft.activeProfileId === profileId) {
                    draft.activeProfileId =
                        draft.profiles[index]?.id ?? draft.profiles[index - 1]?.id ?? null;
                }
                draft.dirty = true;
            });
        },

        setProfileLabel: (profileId, label) =>
            set((draft) => {
                const profile = draft.profiles.find((p) => p.id === profileId);
                if (profile) profile.label = label;
                draft.dirty = true;
            }),

        toggleGroup: (profileId, groupId) => {
            const owner = get().profiles.find(
                (p) => p.id !== profileId && p.group_ids.includes(groupId),
            );
            if (owner) {
                get().toast(`该群已被「${owner.label}」绑定`);
                return;
            }
            set((draft) => {
                const profile = draft.profiles.find((p) => p.id === profileId);
                if (!profile) return;
                const index = profile.group_ids.indexOf(groupId);
                if (index >= 0) profile.group_ids.splice(index, 1);
                else profile.group_ids.push(groupId);
                draft.dirty = true;
            });
        },

        removeGroup: (profileId, groupId) =>
            set((draft) => {
                const profile = draft.profiles.find((p) => p.id === profileId);
                if (!profile) return;
                const index = profile.group_ids.indexOf(groupId);
                if (index >= 0) profile.group_ids.splice(index, 1);
                draft.dirty = true;
            }),

        reorderFeature: (profileId, fromKey, toKey) => {
            set((draft) => {
                const meta = draft.meta;
                const profile = draft.profiles.find((p) => p.id === profileId);
                if (!meta || !profile) return;
                const order = featureOrder(profile, meta.features);
                const from = order.indexOf(fromKey);
                const to = order.indexOf(toKey);
                if (from < 0 || to < 0 || from === to) return;
                order.splice(from, 1);
                order.splice(to, 0, fromKey);
                profile.feature_order = order;
                draft.dirty = true;
            });
        },

        updateFeature: (profileId, featureKey, updater) =>
            set((draft) => {
                const profile = draft.profiles.find((p) => p.id === profileId);
                const settings = profile?.features[featureKey];
                if (!settings) return;
                updater(settings);
                draft.dirty = true;
            }),

        toggleGroupFeature: (groupId, featureKey) => {
            const owner = get().profiles.find((p) => p.group_ids.includes(groupId));
            if (!owner) {
                get().toast('该群还没有绑定任何配置，请先在「群配置」里绑定', 'err');
                return;
            }
            const settings = owner.features[featureKey];
            if (!settings) {
                get().toast('该配置没有这个功能', 'err');
                return;
            }
            const next = !settings.enabled;
            set((draft) => {
                const profile = draft.profiles.find((p) => p.id === owner.id);
                const target = profile?.features[featureKey];
                if (!target) return;
                target.enabled = next;
                draft.dirty = true;
            });
            get().toast(`已在「${owner.label}」中${next ? '启用' : '停用'}该功能，保存后生效`);
        },

        /* ---------------- 折叠状态 ---------------- */

        setCollapsed: (key, value) =>
            set((draft) => {
                draft.collapsed[key] = value;
            }),

        setProfileCollapsedAll: (profileId, value, section: 'features' | 'texts') =>
            set((draft) => {
                const prefix = section === 'texts' ? 'text|' : '';
                draft.meta?.features.forEach((feature) => {
                    draft.collapsed[`${prefix}${profileId}|${feature.key}`] = value;
                });
            }),

        /* ---------------- Toast / 确认 / 密码 ---------------- */

        toast: (message, kind = 'ok') => {
            const id = (toastSeq += 1);
            set((draft) => {
                draft.toasts.push({ id, message, kind });
            });
            window.setTimeout(() => get().dismissToast(id), TOAST_LIFE);
        },

        dismissToast: (id) => {
            // 两段式退场：先标记让界面播动画，动画结束后再真正移除，
            // 这样多个提示窗堆叠时其余项会平滑上移而不是瞬间跳位
            set((draft) => {
                const item = draft.toasts.find((t) => t.id === id);
                if (item) item.leaving = true;
            });
            window.setTimeout(() => {
                set((draft) => {
                    draft.toasts = draft.toasts.filter((t) => t.id !== id);
                });
            }, TOAST_EXIT);
        },

        askConfirm: (title, text, tone = 'default') =>
            new Promise<boolean>((resolve) => {
                set((draft) => {
                    draft.confirmState = { title, text, tone, resolve };
                });
            }),

        resolveConfirm: (ok) => {
            const state = get().confirmState;
            set((draft) => {
                draft.confirmState = null;
            });
            state?.resolve(ok);
        },

        setPasswordOpen: (open) =>
            set((draft) => {
                draft.passwordOpen = open;
            }),
    })),
);
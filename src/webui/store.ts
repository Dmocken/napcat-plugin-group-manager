import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { NeedPasswordError, downloadFile, request } from '@/lib/api';
import { TEXT_FIELDS } from '@/lib/constants';
import { featureOrder, newProfile, normalizeProfile } from '@/lib/profile';
import { isQq } from '@/lib/utils';
import type {
    DupExportResult,
    DupSnapshotInfo,
    ErrorRecord,
    FeatureSettings,
    GlobalConfig,
    GroupInfo,
    GroupProfile,
    MetaResponse,
    StatusInfo,
    ToastItem,
    ToastKind,
} from '@/lib/types';

/** 左侧导航的页面 */
export type PageKey = 'overview' | 'global' | 'profiles';

interface ConfirmState {
    title: string;
    text: string;
    tone: 'default' | 'danger';
    resolve: (ok: boolean) => void;
}

interface StoreState {
    meta: MetaResponse | null;
    global: GlobalConfig;
    profiles: GroupProfile[];
    groups: GroupInfo[];
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
    /** 群成员快照信息（重复加群检测用） */
    dupSnapshot: DupSnapshotInfo | null;

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

    addProfile: () => void;
    removeProfile: (profileId: string) => void;
    setProfileLabel: (profileId: string, label: string) => void;
    toggleGroup: (profileId: string, groupId: string) => void;
    /** @returns 是否真的添加成功（失败时已自动提示） */
    addGroup: (profileId: string, groupId: string) => boolean;
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

const nowText = (): string =>
    new Date().toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });

export const useStore = create<StoreState>()(
    immer((set, get) => ({
        meta: null,
        global: {},
        profiles: [],
        groups: [],
        status: null,
        dirty: false,
        loading: false,
        saving: false,
        lastSavedAt: null,
        errorBanner: null,
        errors: [],
        errorsBootAt: null,
        dupSnapshot: null,

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
                const [meta, global, profiles, groups] = await Promise.all([
                    request<MetaResponse>('/meta'),
                    request<GlobalConfig>('/config'),
                    request<GroupProfile[]>('/profiles'),
                    request<GroupInfo[]>('/groups').catch(() => [] as GroupInfo[]),
                ]);
                void get().refreshErrors();
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

        addGroup: (profileId, groupId) => {
            if (!isQq(groupId)) {
                get().toast('请输入正确的群号', 'err');
                return false;
            }
            const owner = get().profiles.find(
                (p) => p.id !== profileId && p.group_ids.includes(groupId),
            );
            if (owner) {
                get().toast(`该群已被「${owner.label}」绑定`);
                return false;
            }
            const profile = get().profiles.find((p) => p.id === profileId);
            if (profile?.group_ids.includes(groupId)) {
                get().toast('该群已绑定');
                return false;
            }
            set((draft) => {
                const target = draft.profiles.find((p) => p.id === profileId);
                if (!target) return;
                target.group_ids.push(groupId);
                draft.dirty = true;
            });
            return true;
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
            window.setTimeout(() => get().dismissToast(id), 2600);
        },

        dismissToast: (id) =>
            set((draft) => {
                draft.toasts = draft.toasts.filter((t) => t.id !== id);
            }),

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
import { TEXT_GROUP } from './constants';
import { cloneDefault } from './utils';
import type {
    FeatureMeta,
    FeatureSettings,
    GroupProfile,
    MetaResponse,
    ParamMeta,
} from './types';

/** 当前功能顺序：过滤掉已不存在的功能，缺失的补到末尾 */
export function featureOrder(
    profile: { feature_order?: string[] },
    features: readonly { key: string }[],
): string[] {
    const all = features.map((f) => f.key);
    const order = Array.isArray(profile.feature_order)
        ? profile.feature_order.filter((key) => all.includes(key))
        : [];
    all.forEach((key) => {
        if (!order.includes(key)) order.push(key);
    });
    return order;
}

/** 功能里的业务参数（不含「提示文案」组，后者单独成页） */
export function behaviorParams(meta: FeatureMeta): ParamMeta[] {
    return (meta.params ?? []).filter((param) => param.group !== TEXT_GROUP);
}

/** 功能里的提示文案参数 */
export function textParamsOf(meta: FeatureMeta): ParamMeta[] {
    return (meta.params ?? []).filter((param) => param.group === TEXT_GROUP);
}

/** 折叠状态下显示的一行摘要 */
export function featureSummary(meta: FeatureMeta, settings: FeatureSettings): string {
    if (!settings.enabled) return '未启用';
    const parts = [settings.allow_group_admin ? '群管可用' : '仅名单'];
    if (settings.allowed_users.length) parts.push(`名单 ${settings.allowed_users.length} 人`);
    const count = behaviorParams(meta).length;
    if (count) parts.push(`参数 ${count} 项`);
    return parts.join(' · ');
}

/** 删除一条配置时的影响面，用于确认弹窗 */
export function profileImpact(profile: GroupProfile): {
    groups: number;
    features: number;
    users: number;
} {
    let features = 0;
    let users = 0;
    Object.values(profile.features).forEach((settings) => {
        if (settings.enabled) features += 1;
        users += settings.allowed_users.length;
    });
    return { groups: profile.group_ids.length, features, users };
}

/** 旧参数迁移：加群审核的 ai_enabled 开关 → judge_mode 三态 */
function migrateParams(params: Record<string, unknown>): void {
    const mode = params.judge_mode;
    if (mode !== undefined && mode !== null && String(mode).trim()) return;
    const legacy = params.ai_enabled;
    const enabled = legacy === true || Number(legacy) === 1;
    params.judge_mode = enabled ? 'ai' : 'semantic';
    delete params.ai_enabled;
}

/** 把后端返回的一条群配置补全成前端可直接编辑的完整结构 */
export function normalizeProfile(
    profile: Partial<GroupProfile> | null | undefined,
    meta: MetaResponse,
): GroupProfile {
    const source = profile ?? {};
    const next: GroupProfile = {
        id: source.id || `profile-${Date.now()}`,
        label: source.label || '新建群配置',
        group_ids: Array.isArray(source.group_ids) ? source.group_ids.map(String) : [],
        features: {},
    };

    const validKeys = meta.features.map((f) => f.key);
    if (Array.isArray(source.feature_order)) {
        const order = source.feature_order.filter((key) => validKeys.includes(key));
        if (order.length) next.feature_order = order;
    }

    meta.features.forEach((feature) => {
        const raw = source.features?.[feature.key];
        const params = { ...(raw?.params ?? {}) };
        migrateParams(params);
        const settings: FeatureSettings = {
            // 兼容早期可能存成 0 / 1 的旧值
            enabled: raw ? raw.enabled === true || (raw.enabled as unknown) === 1 : false,
            allow_group_admin: raw
                ? raw.allow_group_admin === true || (raw.allow_group_admin as unknown) === 1
                : false,
            allowed_users: Array.isArray(raw?.allowed_users) ? raw.allowed_users.map(String) : [],
            params,
        };
        feature.params.forEach((param) => {
            if (settings.params[param.key] === undefined) {
                settings.params[param.key] = cloneDefault(param.default);
            }
        });
        next.features[feature.key] = settings;
    });

    return next;
}

/** 新建一条群配置（所有功能默认关闭，参数取默认值） */
export function newProfile(meta: MetaResponse): GroupProfile {
    return normalizeProfile(
        { id: `profile-${Date.now()}`, label: '新建群配置', group_ids: [], features: {} },
        meta,
    );
}
/**
 * 全局状态：NapCat 上下文、配置（全局 + 群配置条目）、统计
 */

import type { NapCatPluginContext } from 'napcat-types/napcat-onebot/network/plugin/types';
import {
    DEFAULT_GLOBAL,
    FEATURE_KEYS,
    defaultFeatureSettings,
} from '../constants';
import type { FeatureSettings, GlobalConfig, GroupProfile, PluginStore } from '../types';
import { readJson, setDataDir, writeJson } from './store';

const CONFIG_FILE = 'config.json';

let ncCtx: NapCatPluginContext | null = null;

export function setContext(ctx: NapCatPluginContext): void {
    ncCtx = ctx;
}

/** 获取上下文，未初始化时抛错 */
export function ctx(): NapCatPluginContext {
    if (!ncCtx) throw new Error('[群管助手] 插件尚未初始化');
    return ncCtx;
}

export function tryCtx(): NapCatPluginContext | null {
    return ncCtx;
}

/* ---------------- 运行统计 ---------------- */

export const stats = {
    messageReceived: 0,
    commandHandled: 0,
    eventHandled: 0,
    errors: 0,
};

export const startedAt = Date.now();

export function uptimeSeconds(): number {
    return Math.floor((Date.now() - startedAt) / 1000);
}

export function uptimeText(): string {
    const s = uptimeSeconds();
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}天${h}小时`;
    if (h > 0) return `${h}小时${m}分钟`;
    return `${m}分钟`;
}

/* ---------------- 配置 ---------------- */

function cleanGlobal(raw: Partial<GlobalConfig> | undefined): GlobalConfig {
    const g = raw ?? {};
    return {
        enabled: g.enabled !== false,
        debug: g.debug === true,
        command_prefix: typeof g.command_prefix === 'string' && g.command_prefix ? g.command_prefix : '/',
        global_admins: Array.isArray(g.global_admins)
            ? g.global_admins.map((v) => String(v).trim()).filter(Boolean)
            : [],
    };
}

function cleanFeature(raw: unknown, key: string): FeatureSettings {
    const base = defaultFeatureSettings(key as never);
    if (!raw || typeof raw !== 'object') return base;
    const r = raw as Partial<FeatureSettings>;
    const params =
        r.params && typeof r.params === 'object' && !Array.isArray(r.params)
            ? { ...base.params, ...(r.params as Record<string, unknown>) }
            : base.params;
    return {
        enabled: r.enabled === true,
        allow_group_admin: r.allow_group_admin === true,
        allowed_users: Array.isArray(r.allowed_users)
            ? r.allowed_users.map((v) => String(v).trim()).filter(Boolean)
            : [],
        params,
    };
}

/** 清洗群配置条目：补全缺失字段、剔除未知功能、去重群号 */
export function cleanProfiles(raw: unknown): GroupProfile[] {
    if (!Array.isArray(raw)) return [];
    const profiles: GroupProfile[] = [];
    const usedIds = new Set<string>();
    const usedGroups = new Set<string>();

    raw.forEach((item, index) => {
        if (!item || typeof item !== 'object') return;
        const p = item as Partial<GroupProfile>;

        let id = typeof p.id === 'string' && p.id ? p.id : `profile-${index + 1}`;
        while (usedIds.has(id)) id = `${id}-x`;
        usedIds.add(id);

        const groupIds: string[] = [];
        if (Array.isArray(p.group_ids)) {
            for (const g of p.group_ids) {
                const gid = String(g).trim();
                if (!gid || usedGroups.has(gid)) continue;
                usedGroups.add(gid);
                groupIds.push(gid);
            }
        }

        const features: Record<string, FeatureSettings> = {};
        for (const key of FEATURE_KEYS) {
            features[key] = cleanFeature(p.features?.[key], key);
        }

        profiles.push({
            id,
            label: typeof p.label === 'string' && p.label ? p.label : `群配置 ${index + 1}`,
            group_ids: groupIds,
            features,
        });
    });

    return profiles;
}

let store: PluginStore = {
    global: { ...DEFAULT_GLOBAL },
    profiles: [],
};

export function loadStore(): PluginStore {
    const raw = readJson<Partial<PluginStore>>(CONFIG_FILE, {});
    store = {
        global: cleanGlobal(raw.global),
        profiles: cleanProfiles(raw.profiles),
    };
    return store;
}

export function saveStore(): void {
    writeJson(CONFIG_FILE, store);
}

export function getGlobal(): GlobalConfig {
    return store.global;
}

export function updateGlobal(patch: Partial<GlobalConfig>): GlobalConfig {
    store.global = cleanGlobal({ ...store.global, ...patch });
    saveStore();
    return store.global;
}

export function getProfiles(): GroupProfile[] {
    return store.profiles;
}

export function replaceProfiles(profiles: GroupProfile[]): void {
    store.profiles = cleanProfiles(profiles);
    saveStore();
}

/* ---------------- 日志 ---------------- */

export function log(...args: unknown[]): void {
    ncCtx?.logger.info(...args);
}

export function logWarn(...args: unknown[]): void {
    ncCtx?.logger.warn(...args);
}

export function logError(...args: unknown[]): void {
    stats.errors += 1;
    ncCtx?.logger.error(...args);
}

export function logDebug(...args: unknown[]): void {
    if (store.global.debug) ncCtx?.logger.debug(...args);
}

/* ---------------- 生命周期 ---------------- */

export function init(ctx: NapCatPluginContext): void {
    setDataDir(ctx.dataPath);
    setContext(ctx);
    loadStore();
    log(`[群管助手] 初始化完成 | 数据目录: ${ctx.dataPath} | 群配置条目: ${store.profiles.length}`);
}

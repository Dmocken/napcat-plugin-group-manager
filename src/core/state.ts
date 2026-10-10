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
import { appendErrorLine, readJson, readErrorLines, setDataDir, writeJson } from './store';

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

    const texts: Record<string, string> = {};
    if (g.texts && typeof g.texts === 'object' && !Array.isArray(g.texts)) {
        for (const [k, v] of Object.entries(g.texts as Record<string, unknown>)) {
            const s = String(v ?? '').trim();
            if (s) texts[k] = s;
        }
    }

    return {
        enabled: g.enabled !== false,
        debug: g.debug === true,
        command_prefix: typeof g.command_prefix === 'string' && g.command_prefix ? g.command_prefix : '/',
        global_admins: Array.isArray(g.global_admins)
            ? g.global_admins.map((v) => String(v).trim()).filter(Boolean)
            : [],
        texts,
        webui_password: typeof g.webui_password === 'string' ? g.webui_password.trim() : '',
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

        // 功能卡片顺序：过滤非法值、去重，再把缺失的功能补到末尾
        const featureOrder: string[] = [];
        if (Array.isArray(p.feature_order)) {
            for (const raw of p.feature_order) {
                const key = String(raw);
                if (FEATURE_KEYS.includes(key as never) && !featureOrder.includes(key)) featureOrder.push(key);
            }
        }
        for (const key of FEATURE_KEYS) {
            if (!featureOrder.includes(key)) featureOrder.push(key);
        }

        profiles.push({
            id,
            label: typeof p.label === 'string' && p.label ? p.label : `群配置 ${index + 1}`,
            group_ids: groupIds,
            feature_order: featureOrder,
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

/** 错误记录里附带的信息：来自命令执行时设置的上下文 */
export interface ErrorContext {
    source?: 'command' | 'event' | 'api' | 'system';
    command?: string;
    feature?: string;
    groupId?: string | number;
    userId?: string | number;
}

export interface ErrorRecord {
    /** 本地时间 YYYY-MM-DD HH:mm:ss */
    time: string;
    /** 记录产生时的插件启动时间戳，用于区分本次启动与历史记录 */
    boot?: number;
    source: string;
    command: string;
    feature: string;
    groupId: string;
    userId: string;
    /** 错误摘要（单行，长文本截断） */
    message: string;
}

/** 保留条数：内存与落盘一致 */
const ERROR_KEEP = 50;

const errorBuffer: ErrorRecord[] = [];

/**
 * 命令执行期间挂上上下文，handler 内部直接调用 logError 时也能带上
 * 「哪个功能、哪个群、哪个用户」，无需逐个改动handler
 */
let activeErrorContext: ErrorContext | null = null;

export function setActiveErrorContext(ctx: ErrorContext | null): void {
    activeErrorContext = ctx;
}

function textOf(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message || String(value);
    if (value === undefined || value === null) return '';
    try {
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
    } catch {
        return String(value);
    }
}

function stamp(offsetMinutes = 0): string {
    const d = new Date(Date.now() - offsetMinutes * 60_000);
    const p = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
        d.getMinutes(),
    )}:${p(d.getSeconds())}`;
}

/** 记录一条错误：内存保留最近 50 条，同时写入 data/errors.log */
export function recordError(args: unknown[], context?: ErrorContext): void {
    const ctxInfo = { ...(activeErrorContext ?? {}), ...(context ?? {}) };
    const text = args
        .map((item) => (item === undefined || item === null ? '' : textOf(item)))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

    const record: ErrorRecord = {
        time: stamp(),
        /** 所属的插件运行实例（startedAt），用于区分本次启动与历史记录 */
        boot: startedAt,
        source: ctxInfo.source ?? 'system',
        command: ctxInfo.command ?? '',
        feature: ctxInfo.feature ?? '',
        groupId: ctxInfo.groupId === undefined ? '' : String(ctxInfo.groupId),
        userId: ctxInfo.userId === undefined ? '' : String(ctxInfo.userId),
        message: text.length > 500 ? `${text.slice(0, 500)}…` : text,
    };

    errorBuffer.unshift(record);
    if (errorBuffer.length > ERROR_KEEP) errorBuffer.length = ERROR_KEEP;
    appendErrorLine(JSON.stringify(record));
}

/** 最近的错误记录（优先读落盘日志，跨重启可见） */
export function recentErrors(limit = ERROR_KEEP): ErrorRecord[] {
    const fromFile = readErrorLines(limit) as ErrorRecord[];
    if (fromFile.length) return fromFile;
    return errorBuffer.slice(0, limit);
}

/**
 * 记录一条错误
 * @param context 额外上下文；不传时自动沿用命令执行期间挂上的上下文
 */
export function logError(...args: unknown[]): void {
    stats.errors += 1;
    const last = args[args.length - 1];
    const context =
        last && typeof last === 'object' && !(last instanceof Error)
            ? (args.pop() as ErrorContext)
            : undefined;
    recordError(args, context);
    ncCtx?.logger.error(...args, ...(context ? [context] : []));
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

/**
 * 旧 NoneBot 版配置 / 数据导入
 *
 * 可导入的文件（均位于旧插件目录的 config/ 下）：
 *   group_mgmt_config.json  插件开关、群主管理员权限、成员名单、全局管理员
 *   newban_config.json      新人禁言时长与通知文案
 *   ban_records.json        禁言记录（退群重进重禁依赖）
 *   black_history.json      黑历史
 *   silent_members.json     静默成员名单
 *   recall_records.json     撤回统计
 *
 * 说明：旧配置里「功能配置完全相同的多个群」会被合并成同一条群配置（一条绑定多个群），
 * 这正是新版本的推荐用法。
 */

import fs from 'node:fs';
import path from 'node:path';

import { FEATURE_KEYS } from '../constants';
import type { FeatureSettings, GroupProfile } from '../types';
import { getGlobal, getProfiles, replaceProfiles, updateGlobal } from '../core/state';
import { dataFile } from '../core/store';

const DATA_FILES = [
    'ban_records.json',
    'black_history.json',
    'silent_members.json',
    'recall_records.json',
];

interface LegacyPluginConfig {
    enabled?: boolean;
    allow_group_admin?: boolean;
    allowed_users?: unknown[];
}

interface LegacyGroupMgmt {
    global_admins?: unknown[];
    defaults?: LegacyPluginConfig;
    groups?: Record<string, Record<string, LegacyPluginConfig>>;
}

interface LegacyNewban {
    defaults?: Record<string, unknown>;
    groups?: Record<string, Record<string, unknown>>;
}

export interface ImportResult {
    ok: boolean;
    message: string;
    admins: number;
    groups: number;
    profiles: number;
    files: string[];
    errors: string[];
}

function readJsonFile<T>(dir: string, file: string): T | null {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) return null;
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8')) as T;
    } catch {
        return null;
    }
}

/** 生成某个群在新结构下的功能设置 */
function buildFeatureSettings(
    key: string,
    override: LegacyPluginConfig | undefined,
    defaults: LegacyPluginConfig
): FeatureSettings {
    const source = override ?? defaults;
    return {
        enabled: source.enabled === true,
        allow_group_admin: source.allow_group_admin === true,
        allowed_users: Array.isArray(source.allowed_users)
            ? source.allowed_users.map((v) => String(v).trim()).filter(Boolean)
            : [],
        params: {},
    };
}

export function importFromLegacy(dir: string, overwriteData = false): ImportResult {
    const result: ImportResult = {
        ok: false,
        message: '',
        admins: 0,
        groups: 0,
        profiles: 0,
        files: [],
        errors: [],
    };

    if (!dir || !fs.existsSync(dir)) {
        result.message = `目录不存在：${dir}`;
        return result;
    }

    const groupMgmt = readJsonFile<LegacyGroupMgmt>(dir, 'group_mgmt_config.json');
    if (!groupMgmt) {
        result.message = `未找到 group_mgmt_config.json（请填写旧插件的 config 目录）`;
        return result;
    }

    const newban = readJsonFile<LegacyNewban>(dir, 'newban_config.json');

    /* ---------- 1. 全局管理员 ---------- */
    const admins = Array.isArray(groupMgmt.global_admins)
        ? groupMgmt.global_admins.map((v) => String(v).trim()).filter(Boolean)
        : [];
    if (admins.length) {
        const merged = Array.from(new Set([...getGlobal().global_admins, ...admins]));
        updateGlobal({ global_admins: merged });
        result.admins = admins.length;
    }

    /* ---------- 2. 群配置 → 按签名合并 ---------- */
    const legacyGroups = groupMgmt.groups ?? {};
    const defaults: LegacyPluginConfig = groupMgmt.defaults ?? {};

    const bySignature = new Map<string, { features: Record<string, FeatureSettings>; groups: string[] }>();

    for (const [groupId, plugins] of Object.entries(legacyGroups)) {
        if (!/^\d+$/.test(groupId)) continue;

        const features: Record<string, FeatureSettings> = {};
        for (const key of FEATURE_KEYS) {
            features[key] = buildFeatureSettings(key, plugins?.[key], defaults);
        }

        // newban 参数
        const nbDefaults = newban?.defaults ?? {};
        const nbGroup = newban?.groups?.[groupId] ?? {};
        features.newban.params = {
            ban_duration: Number(nbGroup.ban_duration ?? nbDefaults.ban_duration ?? 180),
            welcome_text: String(nbGroup.welcome_text ?? nbDefaults.welcome_text ?? ''),
            remute_text: String(nbGroup.remute_text ?? nbDefaults.remute_text ?? ''),
        };

        const signature = JSON.stringify(features);
        const bucket = bySignature.get(signature);
        if (bucket) bucket.groups.push(groupId);
        else bySignature.set(signature, { features, groups: [groupId] });
    }

    /* ---------- 3. 与现有配置合并（跳过已绑定的群） ---------- */
    const existing = getProfiles();
    const boundGroups = new Set(existing.flatMap((p) => p.group_ids));

    const imported: GroupProfile[] = [];
    let index = 1;
    for (const { features, groups } of bySignature.values()) {
        const pending = groups.filter((g) => !boundGroups.has(g));
        if (!pending.length) continue;
        pending.forEach((g) => boundGroups.add(g));
        imported.push({
            id: `imported-${index}`,
            label: pending.length === 1 ? `导入：群 ${pending[0]}` : `导入：${pending.length} 个群共用`,
            group_ids: pending,
            features,
        });
        index += 1;
        result.groups += pending.length;
    }

    result.profiles = imported.length;
    try {
        replaceProfiles([...existing, ...imported]);
    } catch (e) {
        result.errors.push(`写入群配置失败：${String(e)}`);
    }

    /* ---------- 4. 业务数据文件 ---------- */
    for (const file of DATA_FILES) {
        const src = path.join(dir, file);
        if (!fs.existsSync(src)) continue;
        const dst = dataFile(file);
        if (fs.existsSync(dst) && !overwriteData) continue;
        try {
            fs.copyFileSync(src, dst);
            result.files.push(file);
        } catch (e) {
            result.errors.push(`复制 ${file} 失败：${String(e)}`);
        }
    }

    result.ok = true;
    result.message = `已导入 ${result.profiles} 条群配置（覆盖 ${result.groups} 个群）`;
    return result;
}

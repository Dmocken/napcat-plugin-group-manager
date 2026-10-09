/**
 * 群配置条目：查找、校验、写入
 *
 * 结构说明：
 *   一条 profile 可绑定多个群（group_ids），这些群共用同一套功能开关与权限；
 *   同一个群不允许出现在多条 profile 中。
 */

import { FEATURE_KEYS, createEmptyProfile, defaultFeatureSettings } from '../constants';
import type { FeatureSettings, GroupProfile } from '../types';
import { cleanProfiles, getProfiles, replaceProfiles } from './state';

/** 按群号找到其所属的配置条目 */
export function findProfileByGroup(groupId: number | string): GroupProfile | undefined {
    const key = String(groupId);
    return getProfiles().find((p) => p.group_ids.includes(key));
}

/** 读取某群某功能的生效设置；未配置时返回「全部关闭」的默认值 */
export function getFeatureSettings(groupId: number | string, key: string): FeatureSettings {
    const profile = findProfileByGroup(groupId);
    const settings = profile?.features?.[key];
    if (settings) return settings;
    return defaultFeatureSettings(key as never);
}

/** 该群启用了哪些功能 */
export function enabledFeatureKeys(groupId: number | string): string[] {
    const profile = findProfileByGroup(groupId);
    if (!profile) return [];
    return FEATURE_KEYS.filter((k) => profile.features?.[k]?.enabled === true);
}

/** 生成一个新的条目 id */
export function nextProfileId(): string {
    const used = new Set(getProfiles().map((p) => p.id));
    let i = 1;
    while (used.has(`profile-${i}`)) i += 1;
    return `profile-${i}`;
}

export function newProfile(): GroupProfile {
    return createEmptyProfile(nextProfileId());
}

export type ValidateResult =
    | { ok: true; profiles: GroupProfile[] }
    | { ok: false; message: string };

/** 校验并规范化前端提交的群配置列表 */
export function validateProfiles(input: unknown): ValidateResult {
    if (!Array.isArray(input)) return { ok: false, message: '群配置必须是数组' };

    const seenGroup = new Map<string, number>();
    const seenId = new Set<string>();

    for (let i = 0; i < input.length; i += 1) {
        const raw = input[i];
        if (!raw || typeof raw !== 'object') return { ok: false, message: `第 ${i + 1} 条配置格式错误` };

        const p = raw as Partial<GroupProfile>;
        const label = typeof p.label === 'string' && p.label.trim() ? p.label.trim() : `群配置 ${i + 1}`;
        const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `profile-${i + 1}`;

        if (seenId.has(id)) return { ok: false, message: `第 ${i + 1} 条配置的 id「${id}」重复` };
        seenId.add(id);

        if (!Array.isArray(p.group_ids) || p.group_ids.length === 0) {
            return { ok: false, message: `「${label}」至少需要绑定一个群` };
        }

        for (const g of p.group_ids) {
            const gid = String(g).trim();
            if (!/^\d{5,12}$/.test(gid)) {
                return { ok: false, message: `「${label}」中的群号「${gid}」格式不正确` };
            }
            const owner = seenGroup.get(gid);
            if (owner !== undefined) {
                return {
                    ok: false,
                    message: `群 ${gid} 同时出现在第 ${owner + 1} 条和第 ${i + 1} 条配置中，请合并到同一条`,
                };
            }
            seenGroup.set(gid, i);
        }
    }

    return { ok: true, profiles: cleanProfiles(input) };
}

/** 保存前端提交的群配置（校验通过才写入） */
export function saveProfiles(input: unknown): { ok: boolean; message?: string } {
    const result = validateProfiles(input);
    if (!result.ok) return { ok: false, message: result.message };
    replaceProfiles(result.profiles);
    return { ok: true };
}

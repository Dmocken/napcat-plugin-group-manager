/**
 * 权限判定（四层模型）
 *
 *   L1 Bot 管理员（global_admins）    —— 最高权限，不看名单
 *   L2 分群配置条目（可绑多个群）      —— 决定该群启用哪些功能
 *   L3 群内管理（群主 / 管理员）       —— 由 allow_group_admin 控制
 *   L4 群内指定成员                    —— 由 allowed_users 名单控制
 *
 * 判定顺序与旧 NoneBot 版 group_mgmt_config.check_permission 保持一致：
 *   global_admins → allowed_users → allow_group_admin + 群主/管理员 → 拒绝
 */

import type { FeatureSettings } from '../types';
import { getFeatureSettings } from './profiles';
import { getGlobal } from './state';

export function isGlobalAdmin(userId: number | string): boolean {
    const uid = String(userId);
    return getGlobal().global_admins.includes(uid);
}

/** 是否为群主或管理员 */
export function isGroupManager(role: string | undefined): boolean {
    return role === 'owner' || role === 'admin';
}

/** 插件总开关是否打开 */
export function isPluginEnabled(): boolean {
    return getGlobal().enabled;
}

export interface AccessResult {
    /** 该群是否启用了此功能 */
    enabled: boolean;
    /** 是否在 L1~L4 中命中 */
    hasPermission: boolean;
    /** 是否为 Bot 管理员 */
    isAdmin: boolean;
    settings: FeatureSettings;
}

export function checkFeatureAccess(
    groupId: number | string,
    userId: number | string,
    role: string | undefined,
    key: string
): AccessResult {
    const settings = getFeatureSettings(groupId, key);
    const uid = String(userId);

    const isAdmin = isGlobalAdmin(uid);
    const inList = settings.allowed_users.includes(uid);
    const byRole = settings.allow_group_admin && isGroupManager(role);

    return {
        enabled: settings.enabled === true,
        hasPermission: isAdmin || inList || byRole,
        isAdmin,
        settings,
    };
}

/**
 * 使用功能（ban、sm、入典 等）：必须该群已启用，且命中 L1~L4
 */
export function canUse(
    groupId: number | string,
    userId: number | string,
    role: string | undefined,
    key: string
): boolean {
    if (!isPluginEnabled()) return false;
    const access = checkFeatureAccess(groupId, userId, role, key);
    return access.enabled && access.hasPermission;
}

/**
 * 开关功能（newban open / join close 等）：
 * Bot 管理员与命中权限者都可以操作；Bot 管理员即使该群未启用也能操作，
 * 否则会出现「功能没开 → 谁都开不了」的死锁。
 */
export function canToggle(
    groupId: number | string,
    userId: number | string,
    role: string | undefined,
    key: string
): boolean {
    if (!isPluginEnabled()) return false;
    const access = checkFeatureAccess(groupId, userId, role, key);
    if (access.isAdmin) return true;
    return access.enabled && access.hasPermission;
}

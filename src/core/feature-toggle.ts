/**
 * 功能开关命令（xxx open / xxx close）的统一实现
 *
 * newban / join / recall 的开关命令逻辑完全一致：读当前状态 → 写回 → 回文案。
 * 文案默认值直接从 constants 的功能元信息里取，避免 handler 再抄一份默认文案。
 */

import { FEATURE_TEXT_PARAMS } from '../constants';
import type { CommandContext, FeatureKey } from '../types';
import { sendGroup } from './messages';
import { getFeatureSettings, setFeatureEnabled } from './profiles';
import { paramText } from './texts';

/** 一个开关命令用到的五个文案参数 key */
export interface ToggleTextKeys {
    /** 已经是开启状态时的提示 */
    onEcho: string;
    /** 开启成功 */
    opened: string;
    /** 已经是关闭状态时的提示 */
    offEcho: string;
    /** 关闭成功 */
    closed: string;
    /** 用法提示 */
    usage: string;
}

/** 取该功能某个文案参数的默认值（constants 是唯一来源） */
function defaultText(feature: FeatureKey, key: string): string {
    const param = FEATURE_TEXT_PARAMS[feature]?.find((item) => item.key === key);
    return typeof param?.default === 'string' ? param.default : '';
}

/** 处理 open / close：未命中开关时回用法提示 */
export async function handleFeatureToggle(
    c: CommandContext,
    feature: FeatureKey,
    keys: ToggleTextKeys,
): Promise<void> {
    const settings = getFeatureSettings(c.groupId, feature);
    const params = settings.params;
    const arg = (c.argv[0] ?? '').toLowerCase();

    if (arg === 'open') {
        if (settings.enabled) {
            await sendGroup(c.groupId, paramText(params, keys.onEcho, defaultText(feature, keys.onEcho)));
            return;
        }
        setFeatureEnabled(c.groupId, feature, true);
        await sendGroup(
            c.groupId,
            paramText(params, keys.opened, defaultText(feature, keys.opened), { group: c.groupId }),
        );
        return;
    }

    if (arg === 'close') {
        if (!settings.enabled) {
            await sendGroup(c.groupId, paramText(params, keys.offEcho, defaultText(feature, keys.offEcho)));
            return;
        }
        setFeatureEnabled(c.groupId, feature, false);
        await sendGroup(
            c.groupId,
            paramText(params, keys.closed, defaultText(feature, keys.closed), { group: c.groupId }),
        );
        return;
    }

    await sendGroup(c.groupId, paramText(params, keys.usage, defaultText(feature, keys.usage)));
}

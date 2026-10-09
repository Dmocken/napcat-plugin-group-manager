/**
 * 可配置文案渲染
 *
 * 所有面向群成员的提示都可以在 WebUI 的对应功能模块里改，支持占位符：
 *   {user}     目标 QQ 号
 *   {time}     时长（人类可读，如「3分钟」，ban 回执里是原始输入「1s」）
 *   {seconds}  秒数
 *   {clock}    时间点（HH:MM:SS）
 *   {id}       编号
 *   {content}  正文内容
 *   {group}    群号
 *   {error}    错误信息
 * 未提供的占位符会原样保留（方便排查写错的占位符）。
 */

import { getGlobal } from './state';
import { paramString } from './utils';

export type TextVars = Record<string, string | number | undefined | null>;

/** 把 {key} 替换成 vars[key] */
export function renderText(template: string, vars: TextVars = {}): string {
    let out = String(template ?? '');
    for (const [k, v] of Object.entries(vars)) {
        out = out.split(`{${k}}`).join(String(v ?? ''));
    }
    return out;
}

/** 从功能参数里取文案（空则回退默认）并渲染占位符 */
export function paramText(
    params: Record<string, unknown>,
    key: string,
    def: string,
    vars: TextVars = {},
): string {
    return renderText(paramString(params, key, def), vars);
}

/* ---------------- 全局通用文案 ---------------- */

export const GLOBAL_TEXT_DEFAULTS: Record<string, string> = {
    no_permission: '您没有权限使用该功能。',
    need_group: '该命令只能在群聊中使用。',
    need_private: '该命令只能在私聊中使用。',
    feature_disabled: '本群未启用该功能。',
    plugin_disabled: '插件总开关已关闭。',
};

/** 全局文案（存在 store.global.texts 里，缺省用内置默认） */
export function globalText(key: string, vars: TextVars = {}): string {
    const texts = (getGlobal() as { texts?: Record<string, string> }).texts ?? {};
    return renderText(texts[key] || GLOBAL_TEXT_DEFAULTS[key] || key, vars);
}

/**
 * 群管助手 - NapCat 插件入口
 *
 * 生命周期：
 *   plugin_init      加载插件：初始化上下文、生成配置 Schema、注册页面与接口
 *   plugin_onmessage 群聊 / 私聊消息：命令分发
 *   plugin_onevent   通知 / 请求事件：按 notice_type / request_type 分发
 *   plugin_cleanup   卸载：清理资源
 */

import type {
    NapCatPluginContext,
    PluginConfigSchema,
    PluginModule,
} from 'napcat-types/napcat-onebot/network/plugin/types';

import { buildConfigSchema } from './config';
import { dispatchNotice, dispatchRequest } from './core/events';
import { dispatchMessage } from './core/router';
import { getGlobal, init, log, logError, updateGlobal } from './core/state';
import { registerApiRoutes } from './services/api-service';
import type { GlobalConfig, RawEventLike } from './types';

// 副作用导入：在模块加载时完成命令 / 事件注册
import './handlers/black';
import './handlers/ping';

/** NapCat WebUI 配置面板 Schema（在 plugin_init 中生成） */
export let plugin_config_ui: PluginConfigSchema = [];

export const plugin_init: PluginModule['plugin_init'] = async (ctx: NapCatPluginContext) => {
    try {
        init(ctx);
        plugin_config_ui = buildConfigSchema(ctx);
        registerWebUI(ctx);
        registerApiRoutes(ctx);
        log('[群管助手] 加载完成');
    } catch (e) {
        ctx.logger.error('[群管助手] 初始化失败:', e);
    }
};

export const plugin_onmessage: PluginModule['plugin_onmessage'] = async (_ctx, event) => {
    try {
        await dispatchMessage(event as unknown as RawEventLike);
    } catch (e) {
        logError('[群管助手] 消息处理异常:', e);
    }
};

export const plugin_onevent: PluginModule['plugin_onevent'] = async (_ctx, event) => {
    const ev = event as unknown as RawEventLike;
    try {
        if (ev.post_type === 'notice') await dispatchNotice(ev);
        else if (ev.post_type === 'request') await dispatchRequest(ev);
    } catch (e) {
        logError('[群管助手] 事件处理异常:', e);
    }
};

export const plugin_cleanup: PluginModule['plugin_cleanup'] = async (_ctx) => {
    log('[群管助手] 插件已卸载');
};

/* ---------------- 配置面板钩子 ---------------- */

export const plugin_get_config: PluginModule['plugin_get_config'] = async () => ({ ...getGlobal() });

export const plugin_set_config: PluginModule['plugin_set_config'] = async (_ctx, config) => {
    updateGlobal((config ?? {}) as Partial<GlobalConfig>);
};

export const plugin_on_config_change: PluginModule['plugin_on_config_change'] = async (
    _ctx,
    _ui,
    key,
    value,
) => {
    updateGlobal({ [key]: value } as Partial<GlobalConfig>);
};

/* ---------------- WebUI 页面 ---------------- */

function registerWebUI(ctx: NapCatPluginContext): void {
    // 静态资源：/plugin/<pluginId>/files/static/...
    ctx.router.static('/static', 'webui');

    // 插件页面：/plugin/<pluginId>/page/dashboard
    ctx.router.page({
        path: 'dashboard',
        title: '群管助手',
        icon: '🛡️',
        htmlFile: 'webui/index.html',
        description: '群配置、权限与成员名单',
    });

    ctx.logger.debug('[群管助手] WebUI 页面注册完成');
}

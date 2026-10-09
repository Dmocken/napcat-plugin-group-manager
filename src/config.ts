/**
 * NapCat WebUI 配置面板 Schema
 *
 * 注意：NapCat 的配置表单只支持扁平字段（boolean / text / number / select / 多选），
 * 无法表达「按群配置」的嵌套结构，因此这里只放全局项；
 * 分群的功能开关、权限与成员名单全部在插件页面（WebUI 中的「群管助手」）里编辑。
 */

import type { NapCatPluginContext, PluginConfigSchema } from 'napcat-types/napcat-onebot/network/plugin/types';

export function buildConfigSchema(ctx: NapCatPluginContext): PluginConfigSchema {
    const C = ctx.NapCatConfig;

    return C.combine(
        C.html(
            '<div style="padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,#6d5efc22,#00b3ff22);border:1px solid #6d5efc44;">' +
                '<div style="font-size:15px;font-weight:600;margin-bottom:4px;">🛡️ 群管助手</div>' +
                '<div style="font-size:12px;opacity:.75;line-height:1.6;">' +
                '禁言 / 踢人 / 随机禁言 / 黑历史 / 新人禁言 / 静默检查 / 加群审核 / 撤回统计。<br/>' +
                '分群的功能开关、群主管理员权限、成员名单请在下方插件页面中配置。' +
                '</div></div>',
        ),
        C.boolean('enabled', '插件总开关', true, '关闭后所有群的所有功能都不再生效（Bot 管理员也会被停用）', true),
        C.boolean('debug', '调试日志', false, '在 NapCat 日志中输出详细执行信息，排查问题用', true),
        C.text('command_prefix', '命令前缀', '/', '形如 / 或 #；sm、smplus 为裸命令，不受前缀影响', true),
        C.text(
            'webui_password',
            '插件页面访问密码',
            '',
            '外部直接打开插件页面 / 接口时需要输入的密码，留空表示不校验（任何人可访问，包括读到 AI 的 API Key，不建议留空）。改完即时生效。',
            true,
        ),
        C.plainText(
            `分群配置入口：NapCat WebUI 插件详情里的「群管助手」页面（路径 /plugin/${ctx.pluginName}/page/dashboard）。` +
                `如果那里没有显示入口，浏览器直接打开 /plugin/${ctx.pluginName}/api/ui 也是同一个配置界面。` +
                `在页面中可以新增「群配置」条目，一条条目可绑定多个群，并逐个功能设置「是否启用 / 群主管理员是否可用 / 允许使用的成员名单」以及各功能的参数与文案。`,
        ),
    );
}

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
        C.plainText(
            '分群配置：在插件页面「群管助手」→「群配置」中新增条目，一条条目可绑定多个群，' +
                '并可逐个功能设置「是否启用 / 群主管理员是否可用 / 允许使用的成员名单」。',
        ),
    );
}

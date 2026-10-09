/**
 * /ping 与 /help
 */

import { sendGroup, sendPrivate } from '../core/messages';
import { isGlobalAdmin } from '../core/permission';
import { enabledFeatureKeys } from '../core/profiles';
import { helpText, registerCommand } from '../core/router';
import { stats, uptimeText } from '../core/state';

registerCommand({
    name: 'ping',
    aliases: ['ping'],
    feature: 'system',
    description: 'ping — 检测插件是否在线（仅 Bot 管理员）',
    permission: 'none',
    handler: async (c) => {
        if (!isGlobalAdmin(c.userId)) return; // 非管理员静默忽略
        const message = [
            'pong！',
            `运行时长：${uptimeText()}`,
            `已接收消息：${stats.messageReceived} 条`,
            `已执行命令：${stats.commandHandled} 次`,
            `异常次数：${stats.errors} 次`,
        ].join('\n');
        if (c.groupId) await sendGroup(c.groupId, message);
        else await sendPrivate(c.userId, message);
    },
});

registerCommand({
    name: 'help',
    aliases: ['帮助'],
    feature: 'system',
    description: 'help — 查看本群可用的群管功能',
    permission: 'none',
    handler: async (c) => {
        const keys = c.groupId ? enabledFeatureKeys(c.groupId) : [];
        const message = helpText(keys);
        if (c.groupId) await sendGroup(c.groupId, message);
        else await sendPrivate(c.userId, message);
    },
});

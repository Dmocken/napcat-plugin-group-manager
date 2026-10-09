/**
 * 黑历史（对应 nonebot/black.py）
 *
 * 数据结构与旧版完全一致，直接沿用旧 black_history.json：
 *   [ { "id": 1, "user_id": 123456, "content": [ { "type": "text", "data": "..." } ] } ]
 *
 * 提示文案可在 WebUI 的「黑历史 → 提示文案」里改。
 */

import { callAction, replyIdOf, segmentsOf, sendGroup } from '../core/messages';
import { getFeatureSettings } from '../core/profiles';
import { registerCommand } from '../core/router';
import { logError, logDebug } from '../core/state';
import { readJson, writeJson } from '../core/store';
import { paramText } from '../core/texts';

const DATA_FILE = 'black_history.json';

interface BlackContent {
    type: string;
    data: string;
}

interface BlackRecord {
    id: number;
    user_id: number;
    content: BlackContent[];
}

function loadHistory(): BlackRecord[] {
    const data = readJson<BlackRecord[]>(DATA_FILE, []);
    return Array.isArray(data) ? data : [];
}

function saveHistory(data: BlackRecord[]): void {
    writeJson(DATA_FILE, data);
}

registerCommand({
    name: '入典',
    feature: 'black',
    description: '入典 — 引用一条纯文字消息记入黑历史',
    handler: async (c) => {
        const params = getFeatureSettings(c.groupId, 'black').params;
        const replyId = replyIdOf(c.event);
        if (!replyId) {
            await sendGroup(c.groupId, paramText(params, 'black_no_reply', '你想让我记住什么啊？'));
            return;
        }

        let targetId = 0;
        let content: BlackContent[] = [];

        try {
            const msg = await callAction<{
                message?: unknown;
                sender?: { user_id?: number | string };
                user_id?: number | string;
            }>('get_msg', { message_id: replyId });

            targetId = Number(msg?.sender?.user_id ?? msg?.user_id ?? 0);

            const segs = Array.isArray(msg?.message) ? msg.message : null;
            if (!segs) {
                await sendGroup(c.groupId, paramText(params, 'black_unsupported', '这种消息我还记不住啦！'));
                return;
            }

            const hasNonText = segs.some((s: { type?: string }) => s.type !== 'text');
            if (hasNonText) {
                await sendGroup(c.groupId, paramText(params, 'black_unsupported', '这种消息我还记不住啦！'));
                return;
            }

            content = segs
                .filter((s: { type?: string }) => s.type === 'text')
                .map((s: { data?: { text?: string } }) => ({ type: 'text', data: String(s.data?.text ?? '') }));

            if (!content.length) {
                await sendGroup(c.groupId, paramText(params, 'black_unsupported', '这种消息我还记不住啦！'));
                return;
            }
        } catch (e) {
            logError('[群管助手] 获取被引用消息失败:', e);
            await sendGroup(c.groupId, paramText(params, 'black_fetch_failed', '我拿不到那条消息，记不住啦！'));
            return;
        }

        const history = loadHistory();
        const newId = history.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
        history.push({ id: newId, user_id: targetId, content });
        saveHistory(history);

        logDebug(`[群管助手] 新增黑历史 #${newId}`);
        await sendGroup(c.groupId, paramText(params, 'black_added', '我记住这b的黑历史啦！编号为：{id}', { id: newId }));
    },
});

registerCommand({
    name: '查看黑历史',
    feature: 'black',
    description: '查看黑历史 [编号 / @某人] — 随机查看一条，带编号或 @ 时精确查询',
    handler: async (c) => {
        const params = getFeatureSettings(c.groupId, 'black').params;
        const history = loadHistory();
        if (!history.length) {
            await sendGroup(c.groupId, paramText(params, 'black_empty', '还没有记录任何黑历史呢'));
            return;
        }

        let record: BlackRecord | undefined;

        if (c.atTargets.length) {
            const target = Number(c.atTargets[0]);
            const own = history.filter((r) => Number(r.user_id) === target);
            if (!own.length) {
                await sendGroup(c.groupId, paramText(params, 'black_user_empty', '这个人还没有黑历史呢~'));
                return;
            }
            record = own[Math.floor(Math.random() * own.length)];
        } else if (c.argv.length) {
            const id = Number(c.argv[0]);
            if (!Number.isFinite(id)) {
                await sendGroup(c.groupId, paramText(params, 'black_bad_id', '你写的这玩意儿是编号吗？！'));
                return;
            }
            record = history.find((r) => Number(r.id) === id);
            if (!record) {
                await sendGroup(
                    c.groupId,
                    paramText(params, 'black_id_not_found', '没有找到编号为 {id} 的黑历史！', { id }),
                );
                return;
            }
        } else {
            record = history[Math.floor(Math.random() * history.length)];
        }

        const body = record.content.map((x) => x.data).join('');
        await sendGroup(
            c.groupId,
            paramText(params, 'black_found', '找到{user}的黑历史(ID:{id})：\n{content}', {
                user: record.user_id,
                id: record.id,
                content: body,
            }),
        );
    },
});

registerCommand({
    name: '删除黑历史',
    feature: 'black',
    description: '删除黑历史 编号 — 删除指定编号的黑历史',
    handler: async (c) => {
        const params = getFeatureSettings(c.groupId, 'black').params;
        if (c.argv.length !== 1) {
            await sendGroup(c.groupId, paramText(params, 'black_del_no_arg', '删哪个？'));
            return;
        }

        const id = Number(c.argv[0]);
        if (!Number.isFinite(id)) {
            await sendGroup(c.groupId, paramText(params, 'black_del_bad_id', '我数数是用的数字数的！'));
            return;
        }

        const history = loadHistory();
        const index = history.findIndex((r) => Number(r.id) === id);
        if (index < 0) {
            await sendGroup(
                c.groupId,
                paramText(params, 'black_del_not_found', '我这儿都没有编号为 {id} 的黑历史啊！', { id }),
            );
            return;
        }

        history.splice(index, 1);
        saveHistory(history);
        await sendGroup(c.groupId, paramText(params, 'black_deleted', '我忘掉编号为 {id} 的黑历史了！', { id }));
    },
});

/** 供 /check debug 之类功能复用的消息段调试输出 */
export function describeSegments(event: Parameters<typeof segmentsOf>[0]): string {
    return segmentsOf(event).map((s) => s.type).join(',');
}

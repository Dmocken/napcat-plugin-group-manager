/**
 * 群静默成员检查（对应 nonebot/check_silent.py）
 *
 * 群聊：
 *   check                       检查并记录入群超 N 天且从未发言的成员
 *   check kick [原因]           踢出已记录的静默成员（可选先私聊通知原因）
 *   check user QQ号             查看某成员的入群/发言时间
 *   check debug                 输出接口原始数据，便于排查
 * 私聊（仅 Bot 管理员）：
 *   check group 群号 [kick|debug] [原因]
 */

import type { CommandContext } from '../types';
import { callAction, sendForward, sendGroup, sendPrivate } from '../core/messages';
import { canUse, isGlobalAdmin } from '../core/permission';
import { getFeatureSettings } from '../core/profiles';
import { registerCommand } from '../core/router';
import { logError } from '../core/state';
import { readJson, writeJson } from '../core/store';
import { paramText } from '../core/texts';
import { formatTime, paramNumber, paramString, toSeconds } from '../core/utils';

const DATA_FILE = 'silent_members.json';

interface SilentMember {
    user_id: number;
    nickname: string;
    card: string;
    join_time: number;
    last_sent_time: number;
}

type SilentData = Record<string, SilentMember[]>;

function loadSilentData(): SilentData {
    const data = readJson<SilentData>(DATA_FILE, {});
    return data && typeof data === 'object' ? data : {};
}

function loadSilentMembers(groupId: number | string): SilentMember[] {
    const list = loadSilentData()[String(groupId)];
    return Array.isArray(list) ? list : [];
}

function saveSilentMembers(groupId: number | string, members: SilentMember[]): void {
    const data = loadSilentData();
    data[String(groupId)] = members;
    writeJson(DATA_FILE, data);
}

interface ReportTarget {
    /** 触发命令的群（私聊触发为 0） */
    groupId: number;
    /** 报告接收人 */
    userId: number;
}

/** 就地反馈：群聊触发的回群里，私聊触发的回私聊 */
async function say(target: ReportTarget, message: string): Promise<void> {
    if (target.groupId) await sendGroup(target.groupId, message);
    else await sendPrivate(target.userId, message);
}

/** 名单类报告：优先合并转发到私聊（避免刷屏），失败自动降级 */
async function report(target: ReportTarget, title: string, lines: string[]): Promise<void> {
    await sendForward({ userId: target.userId, title, lines });
}

interface MemberRaw {
    user_id?: number;
    nickname?: string;
    card?: string;
    role?: string;
    join_time?: number;
    last_sent_time?: number;
}

/** 补齐成员信息：列表接口缺字段时单独拉一次 */
async function enrichMember(groupId: number, member: MemberRaw): Promise<MemberRaw> {
    let joinTime = toSeconds(Number(member.join_time ?? 0));
    let lastSent = toSeconds(Number(member.last_sent_time ?? 0));
    if (joinTime && lastSent) return { ...member, join_time: joinTime, last_sent_time: lastSent };

    try {
        const info = await callAction<MemberRaw>('get_group_member_info', {
            group_id: String(groupId),
            user_id: String(member.user_id ?? 0),
            no_cache: true,
        });
        if (info?.join_time) joinTime = toSeconds(Number(info.join_time));
        if (info?.last_sent_time !== undefined) lastSent = toSeconds(Number(info.last_sent_time));
    } catch {
        /* 取不到就保持原值 */
    }

    return { ...member, join_time: joinTime, last_sent_time: lastSent };
}

async function fetchMemberList(groupId: number): Promise<MemberRaw[]> {
    const list = await callAction<MemberRaw[]>('get_group_member_list', { group_id: String(groupId) });
    return Array.isArray(list) ? list : [];
}

/* ---------------- 检查 ---------------- */

async function doCheck(groupId: number, target: ReportTarget): Promise<void> {
    const params = getFeatureSettings(groupId, 'check_silent').params;
    const days = Math.max(1, Math.floor(paramNumber(params, 'days', 3)));
    const treatUnknown = paramNumber(params, 'treat_unknown_eligible', 1) !== 0;

    await say(target, '🔍 正在检查群成员，请稍候...');

    let memberList: MemberRaw[];
    try {
        memberList = await fetchMemberList(groupId);
    } catch (e) {
        logError('[群管助手] 获取群成员列表失败:', e);
        await say(target, `❌ 获取群成员列表失败：${String(e)}`);
        return;
    }

    // 清理已退群/被踢成员的旧记录
    const currentIds = new Set(memberList.map((m) => Number(m.user_id ?? 0)));
    const old = loadSilentMembers(groupId);
    const cleaned = old.filter((m) => currentIds.has(m.user_id));
    if (cleaned.length !== old.length) saveSilentMembers(groupId, cleaned);

    const now = Math.floor(Date.now() / 1000);
    const threshold = now - days * 86400;

    const silent: SilentMember[] = [];
    let unknownJoinTime = 0;

    for (const raw of memberList) {
        const role = raw.role ?? 'member';
        if (role === 'owner' || role === 'admin') continue;

        const member = await enrichMember(groupId, raw);
        const joinTime = Number(member.join_time ?? 0);
        const lastSent = Number(member.last_sent_time ?? 0);

        // 从未发言：NapCat 中 last_sent_time == join_time；部分协议端返回 0
        if (lastSent !== joinTime && lastSent !== 0) continue;

        if (!joinTime) {
            unknownJoinTime += 1;
            if (!treatUnknown) continue;
        } else if (joinTime > threshold) {
            continue;
        }

        silent.push({
            user_id: Number(member.user_id ?? 0),
            nickname: member.nickname ?? '',
            card: member.card ?? '',
            join_time: joinTime,
            last_sent_time: lastSent,
        });
    }

    saveSilentMembers(groupId, silent);

    if (!silent.length) {
        let message = `✅ 未发现入群超过${days}天且从未发言的成员。`;
        if (unknownJoinTime > 0) message += `\n⚠️ 另有 ${unknownJoinTime} 人无法获取入群时间（已跳过）。`;
        await say(target, message);
        return;
    }

    const lines = silent.map((m, i) => {
        const name = m.card || m.nickname || String(m.user_id);
        return `${i + 1}. ${name} (${m.user_id})\n   入群时间：${formatTime(m.join_time)}`;
    });
    if (unknownJoinTime > 0) {
        lines.push(`\n⚠️ 本次有 ${unknownJoinTime} 名成员无法获取入群时间，已按配置视为符合条件处理。`);
    }
    lines.push('\n💡 可使用 check kick 一键踢出，或使用 check kick [原因] 在踢出前私聊通知。');

    await report(target, `共发现 ${silent.length} 名静默成员（入群超${days}天且从未发言）`, lines);
}

/* ---------------- 踢出 ---------------- */

async function doKick(groupId: number, target: ReportTarget, reason: string): Promise<void> {
    const defaultReason = paramString(getFeatureSettings(groupId, 'check_silent').params, 'kick_reason', '');
    const finalReason = reason || defaultReason;

    const members = loadSilentMembers(groupId);
    if (!members.length) {
        await say(target, '⚠️ 当前没有已记录的静默成员，请先执行 check。');
        return;
    }

    await say(target, `🚀 开始处理 ${members.length} 名静默成员...`);

    let success = 0;
    const kickFails: string[] = [];
    const pmFails: string[] = [];

    for (const m of [...members]) {
        const name = m.card || m.nickname || String(m.user_id);

        if (finalReason) {
            try {
                await callAction('send_private_msg', {
                    user_id: String(m.user_id),
                    group_id: String(groupId),
                    message: `【群通知】\n您因以下原因将被移出本群：\n${finalReason}`,
                });
            } catch (e) {
                pmFails.push(`${name} (${m.user_id})\n   私聊失败：${String(e)}`);
            }
        }

        try {
            await callAction('set_group_kick', {
                group_id: String(groupId),
                user_id: String(m.user_id),
                reject_add_request: false,
            });
            success += 1;
            // 踢出成功立刻落盘，中途报错也不会残留
            const rest = loadSilentMembers(groupId).filter((x) => x.user_id !== m.user_id);
            saveSilentMembers(groupId, rest);
        } catch (e) {
            kickFails.push(`${name} (${m.user_id})\n   踢出失败：${String(e)}`);
        }
    }

    const lines = [`成功踢出 ${success} 人`];
    if (finalReason) {
        if (pmFails.length) {
            lines.push(`\n⚠️ 私聊通知失败 ${pmFails.length} 人：`, ...pmFails);
        } else {
            lines.push('📨 私聊通知均已发送');
        }
    }
    if (kickFails.length) {
        lines.push(`\n❌ 踢出失败 ${kickFails.length} 人（已保留在记录中，可重试）：`, ...kickFails);
    } else {
        lines.push('\n🗑️ 所有记录已清理。');
    }

    await report(target, `静默成员处理结果（共 ${success + kickFails.length} 人）`, lines);
}

/* ---------------- 单人查询 ---------------- */

async function doUserCheck(groupId: number, target: ReportTarget, userId: number): Promise<void> {
    let info: MemberRaw;
    try {
        info = await callAction<MemberRaw>('get_group_member_info', {
            group_id: String(groupId),
            user_id: String(userId),
            no_cache: true,
        });
    } catch (e) {
        await say(target, `❌ 获取成员信息失败：${String(e)}`);
        return;
    }

    const joinTime = toSeconds(Number(info?.join_time ?? 0));
    const lastSent = toSeconds(Number(info?.last_sent_time ?? 0));
    const now = Math.floor(Date.now() / 1000);
    const days = Math.max(1, Math.floor(paramNumber(getFeatureSettings(groupId, 'check_silent').params, 'days', 3)));

    let joinStatus: string;
    let overDays = false;
    if (joinTime > 0) {
        const daysIn = Math.floor((now - joinTime) / 86400);
        joinStatus = `✅ 已入群 ${daysIn} 天（${formatTime(joinTime)}）`;
        overDays = now - joinTime >= days * 86400;
    } else {
        joinStatus = '❌ 无法获取入群时间';
    }

    let speakStatus: string;
    let neverSpoke: boolean;
    if (lastSent === 0) {
        speakStatus = '❌ API 未提供发言时间';
        neverSpoke = true;
    } else if (lastSent === joinTime) {
        speakStatus = '🔇 从未发言';
        neverSpoke = true;
    } else {
        speakStatus = `💬 最后发言：${formatTime(lastSent)}`;
        neverSpoke = false;
    }

    let final: string;
    if (overDays && neverSpoke) final = `⚠️ 符合静默成员条件（入群超${days}天且从未发言）`;
    else if (!overDays) final = `ℹ️ 入群不足${days}天`;
    else if (!neverSpoke) final = 'ℹ️ 有发言记录';
    else final = 'ℹ️ 信息不足，无法判断';

    const roleName: Record<string, string> = { owner: '群主', admin: '管理员', member: '普通成员' };

    await say(
        target,
        `🔍 成员查询结果\n` +
            `━━━━━━━━━━━━━━━\n` +
            `昵称：${info?.nickname ?? ''}\n` +
            `群名片：${info?.card || '无'}\n` +
            `QQ：${userId}\n` +
            `身份：${roleName[info?.role ?? 'member'] ?? info?.role}\n` +
            `━━━━━━━━━━━━━━━\n` +
            `${joinStatus}\n${speakStatus}\n` +
            `━━━━━━━━━━━━━━━\n${final}`,
    );
}

/* ---------------- 调试 ---------------- */

async function doDebug(groupId: number, target: ReportTarget): Promise<void> {
    await say(target, '🔧 正在获取成员列表原始数据...');

    let memberList: MemberRaw[];
    try {
        memberList = await fetchMemberList(groupId);
    } catch (e) {
        await say(target, `❌ 获取群成员列表失败：${String(e)}`);
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    const threeDaysAgo = now - 3 * 86400;
    const lines = [`📊 群 ${groupId} 共 ${memberList.length} 名成员\n`];
    let sampled = 0;

    for (const raw of memberList) {
        if (sampled >= 5) break;
        const role = raw.role ?? 'member';
        if (role === 'owner' || role === 'admin') continue;

        const joinRaw = Number(raw.join_time ?? 0);
        const lastRaw = Number(raw.last_sent_time ?? 0);
        const joinTime = toSeconds(joinRaw);
        const lastSent = toSeconds(lastRaw);

        lines.push(
            `--- 成员 ${sampled + 1} ---\n` +
                `  user_id: ${raw.user_id}\n` +
                `  nickname: ${raw.nickname ?? ''}\n` +
                `  card: ${raw.card ?? ''}\n` +
                `  role: ${role}\n` +
                `  join_time (原始): ${joinRaw} (${formatTime(joinTime)})\n` +
                `  last_sent_time (原始): ${lastRaw} (${formatTime(lastSent)})\n` +
                `  >3天: ${joinTime > 0 && joinTime <= threeDaysAgo ? '是' : '否'}\n` +
                `  last=0: ${lastRaw === 0 ? '是' : '否'}\n` +
                `  last=join: ${lastRaw !== 0 && lastRaw === joinRaw ? '是' : '否'}`,
        );
        sampled += 1;
    }

    lines.push('\n💡 请把上面输出发给开发者分析');
    await report(target, `🔧 调试信息（前 ${sampled} 名成员）`, lines);
}

/* ---------------- 命令 ---------------- */

const USAGE_GROUP =
    '用法：\n' +
    '  check — 检查并记录入群超过 N 天且从未发言的成员\n' +
    '  check kick — 一键踢出已记录的静默成员\n' +
    '  check kick [原因] — 踢出前私聊发送原因\n' +
    '  check user [QQ号] — 查看某成员的入群时间和发言时间\n' +
    '  check debug — 调试：查看 API 返回的原始成员数据';

const USAGE_PRIVATE =
    '私聊用法：\n' +
    '  check group [群号] — 检查指定群\n' +
    '  check group [群号] kick — 一键踢出已记录的静默成员\n' +
    '  check group [群号] kick [原因] — 踢出前私聊通知\n' +
    '  check group [群号] debug — 调试：查看 API 原始数据';

registerCommand({
    name: 'check',
    feature: 'check_silent',
    block: true,
    permission: 'none',
    description: 'check / check kick [原因] / check user QQ号 / check debug — 静默成员检查与踢出',
    handler: async (c: CommandContext) => {
        const params = getFeatureSettings(c.groupId || 0, 'check_silent').params;

        /* ---- 群聊触发 ---- */
        if (c.groupId) {
            if (!canUse(c.groupId, c.userId, c.role, 'check_silent')) {
                await sendGroup(
                    c.groupId,
                    paramText(params, 'check_no_permission', '⛔ 该功能仅限群主或管理员使用。'),
                );
                return;
            }

            const target: ReportTarget = { groupId: c.groupId, userId: c.userId };
            const sub = (c.argv[0] ?? '').toLowerCase();

            if (!sub) {
                await doCheck(c.groupId, target);
                return;
            }

            if (sub === 'kick') {
                await doKick(c.groupId, target, c.argText.slice(4).trim());
                return;
            }

            if (sub === 'debug') {
                await doDebug(c.groupId, target);
                return;
            }

            if (sub === 'user') {
                const uid = Number(c.argv[1]);
                if (!Number.isFinite(uid)) {
                    await sendGroup(c.groupId, paramText(params, 'check_user_usage', '用法：check user [QQ号]'));
                    return;
                }
                await doUserCheck(c.groupId, target, uid);
                return;
            }

            await sendGroup(c.groupId, paramText(params, 'check_usage_group', USAGE_GROUP));
            return;
        }

        /* ---- 私聊触发（仅 Bot 管理员） ---- */
        if (!isGlobalAdmin(c.userId)) {
            await sendPrivate(
                c.userId,
                paramText(params, 'check_private_only', '⛔ 私聊指令仅限机器人主人使用。'),
            );
            return;
        }

        const parts = c.argv;
        if ((parts[0] ?? '').toLowerCase() !== 'group') {
            await sendPrivate(c.userId, paramText(params, 'check_usage_private', USAGE_PRIVATE));
            return;
        }

        const groupId = Number(parts[1]);
        if (!Number.isFinite(groupId)) {
            await sendPrivate(
                c.userId,
                paramText(params, 'check_group_required', '请指定群号，例如：check group 123456'),
            );
            return;
        }

        const target: ReportTarget = { groupId: 0, userId: c.userId };
        const sub = (parts[2] ?? '').toLowerCase();
        const rest = parts.slice(3).join(' ').trim();

        if (!sub) {
            await doCheck(groupId, target);
            return;
        }
        if (sub === 'kick') {
            await doKick(groupId, target, rest);
            return;
        }
        if (sub === 'debug') {
            await doDebug(groupId, target);
            return;
        }

        await sendPrivate(c.userId, paramText(params, 'check_usage_private', USAGE_PRIVATE));
    },
});

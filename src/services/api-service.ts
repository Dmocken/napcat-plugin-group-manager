/**
 * WebUI 接口
 *
 * 注册后被挂载到 /plugin/<pluginId>/api/ 下（无需认证，因为页面本身运行在 NapCat WebUI 内）。
 * 响应格式统一为 { code: 0, data } / { code: -1, message }。
 */

import type {
    NapCatPluginContext,
    PluginHttpRequest,
    PluginHttpResponse,
    PluginRequestHandler,
} from 'napcat-types/napcat-onebot/network/plugin/types';

import { DEFAULT_AI_PROMPT, DEFAULT_GLOBAL, DEFAULT_JUDGE_WORDS, FEATURES, FEATURE_KEYS } from '../constants';
import { parseAiVerdict, testAiConnection } from './ai-judge';
import { beginActivity, noteActivitySent, withActivity } from '../core/activity';
import { at, callAction, seg, type Seg } from '../core/messages';
import { isPluginEnabled } from '../core/permission';
import { findProfileByGroup, newProfile, saveProfiles, validateProfiles } from '../core/profiles';
import { randomInt } from '../core/utils';
import {
    clearSnapshot,
    exportSnapshot,
    importSnapshot,
    readSnapshotFile,
    snapshotInfo,
} from './dup-check';
import { clearActivityLog, recentActivities } from '../core/activity';
import {
    addBlackRecord,
    clearBanRecords,
    clearBlackHistory,
    clearRecallRecords,
    listBanRecords,
    listBlackRecordRows,
    listRecallRows,
    migrateBanRecord,
    migrateRecallUser,
    removeBanRow,
    removeBlackRecords,
    removeRecallUser,
    updateBanDuration,
    updateBlackRecord,
} from '../core/group-data';
import { listSmStats, removeSmStat } from '../core/sm-stats';
import { listBlacklistRows, removeFromBlacklist } from '../core/blacklist';
import { getGroupManagers } from './group-managers';
import { clearErrorLog, getGlobal, getProfiles, recentErrors, startedAt, stats, updateGlobal, uptimeSeconds, uptimeText } from '../core/state';
import { getDataDir, listDataFiles, readLogFile } from '../core/store';

function fail(res: PluginHttpResponse, code: number, message: string): void {
    res.status(code).json({ code: -1, message });
}

/* ---------------- 页面访问密码 ---------------- */

/** 从请求里取密码：支持 x-plugin-password 头 / ?pwd= / cookie gm_pwd= */
function requestPassword(req: PluginHttpRequest): string {
    const header = req.headers['x-plugin-password'];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    if (typeof fromHeader === 'string' && fromHeader) return fromHeader;

    const q = req.query?.pwd;
    const fromQuery = Array.isArray(q) ? q[0] : q;
    if (typeof fromQuery === 'string' && fromQuery) return fromQuery;

    const cookie = req.headers.cookie;
    const raw = Array.isArray(cookie) ? cookie.join(';') : String(cookie ?? '');
    const m = raw.match(/(?:^|;\s*)gm_pwd=([^;]+)/);
    if (m) {
        try {
            return decodeURIComponent(m[1]);
        } catch {
            return m[1];
        }
    }
    return '';
}

/**
 * 响应头里回带服务端时间（**毫秒**时间戳，精度直接决定前端估算的准确度）。
 *
 * 前端据此校准本地时钟（见 webui/lib/server-clock.ts），把「剩余 / 已禁言」这类
 * 时长算在服务端的时间轴上，避免本地外推与服务端判定对不上而跳变。
 * 挂在每条接口上，前端不用额外请求校时。
 */
function withServerTime(handler: PluginRequestHandler): PluginRequestHandler {
    return (req, res, next) => {
        res.setHeader('x-server-time', String(Date.now()));
        return handler(req, res, next);
    };
}

/**
 * 密码守卫：未在「插件配置」里设置密码时放行（保持旧行为）；
 * 设置了密码后，请求必须带上正确密码，否则 401。
 */
function guard(handler: PluginRequestHandler): PluginRequestHandler {
    return (req, res, next) => {
        const expected = String(getGlobal().webui_password ?? '').trim();
        if (!expected) return handler(req, res, next);
        if (requestPassword(req) === expected) return handler(req, res, next);
        res.status(401).json({ code: 401, message: '需要访问密码' });
    };
}

/** 回传给前端的全局配置（去掉密码本身，避免出现在页面里） */
function publicGlobal(): Record<string, unknown> {
    const global = { ...getGlobal() } as Record<string, unknown>;
    delete global.webui_password;
    return global;
}

export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    /* 所有接口都过一遍密码守卫，并统一带上服务端时间 */
    const get = (path: string, handler: PluginRequestHandler): void => {
        router.getNoAuth(path, withServerTime(guard(handler)));
    };
    const post = (path: string, handler: PluginRequestHandler): void => {
        router.postNoAuth(path, withServerTime(guard(handler)));
    };

    /* ---------------- 状态 ---------------- */

    get('/status', (_req, res) => {
        const profiles = getProfiles();
        const uptime = uptimeSeconds();
        res.json({
            code: 0,
            data: {
                pluginName: ctx.pluginName,
                version: '0.1.0',
                uptime: uptimeText(uptime),
                uptimeSeconds: uptime,
                // 与 uptimeSeconds 同一时刻取出：前端用「服务端时间 − 运行秒数」还原启动时刻，
                // 之后就能在服务端时间轴上实时走秒（见 webui/lib/server-clock.ts）。单位毫秒。
                serverTime: Date.now(),
                dataPath: getDataDir(),
                stats: { ...stats },
                global: publicGlobal(),
                summary: {
                    profiles: profiles.length,
                    groups: profiles.reduce((n, p) => n + p.group_ids.length, 0),
                    files: listDataFiles().length,
                },
            },
        });
    });

    /* ---------------- 元信息 ---------------- */

    get('/meta', (_req, res) => {
        res.json({
            code: 0,
            data: {
                features: FEATURES,
                featureKeys: FEATURE_KEYS,
                defaultGlobal: DEFAULT_GLOBAL,
                defaultWords: DEFAULT_JUDGE_WORDS,
            },
        });
    });

    /* ---------------- 全局配置 ---------------- */

    get('/config', (_req, res) => {
        res.json({ code: 0, data: publicGlobal() });
    });

    post('/config', (req, res) => {
        const body = req.body as Record<string, unknown> | undefined;
        if (!body) return fail(res, 400, '请求体为空');
        try {
            // 页面不能改密码，密码只能在 NapCat 的插件配置里设置
            delete body.webui_password;
            updateGlobal(body);
            ctx.logger.info('[群管助手] 全局配置已更新');
            res.json({ code: 0, data: publicGlobal() });
        } catch (e) {
            ctx.logger.error('[群管助手] 保存全局配置失败:', e);
            fail(res, 500, String(e));
        }
    });

    /* ---------------- 群列表 ---------------- */

    get('/groups', async (_req, res) => {
        try {
            const groups = (await ctx.actions.call(
                'get_group_list',
                {},
                ctx.adapterName,
                ctx.pluginManager.config,
            )) as unknown as Array<{ group_id: number; group_name: string; member_count?: number }>;

            const data = (groups ?? []).map((g) => {
                const profile = findProfileByGroup(g.group_id);
                const enabledFeatures = profile
                    ? FEATURE_KEYS.filter((k) => profile.features[k]?.enabled)
                    : [];
                return {
                    group_id: String(g.group_id),
                    group_name: g.group_name,
                    member_count: g.member_count ?? 0,
                    profileId: profile?.id ?? null,
                    enabledFeatures,
                };
            });

            res.json({ code: 0, data });
        } catch (e) {
            ctx.logger.error('[群管助手] 获取群列表失败:', e);
            fail(res, 500, String(e));
        }
    });

    /* ---------------- 好友列表 ---------------- */

    get('/friends', async (_req, res) => {
        try {
            const friends = (await ctx.actions.call(
                'get_friend_list',
                {},
                ctx.adapterName,
                ctx.pluginManager.config,
            )) as unknown as Array<{
                user_id: number | string;
                nickname?: string;
                remark?: string;
            }>;

            const data = (friends ?? []).map((f) => ({
                user_id: String(f.user_id),
                nickname: f.nickname ?? '',
                remark: f.remark ?? '',
            }));

            res.json({ code: 0, data });
        } catch (e) {
            ctx.logger.error('[群管助手] 获取好友列表失败:', e);
            fail(res, 500, String(e));
        }
    });

    /* ---------------- 群发消息（WebUI「发送消息」页） ---------------- */

    /** 群间间隔上限（秒）：再大只会把整轮请求拖到协议端超时 */
    const GAP_LIMIT = 600;

    /** 间隔取值：非法 / 缺省回退默认值，并收进 [0, GAP_LIMIT] */
    const gapOf = (value: unknown, def: number): number => {
        const n = Math.floor(Number(value));
        if (!Number.isFinite(n)) return def;
        return Math.min(Math.max(n, 0), GAP_LIMIT);
    };

    const sleep = (ms: number): Promise<void> =>
        ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

    /**
     * 群发纯文本（可选 @全体成员）。
     *
     * 逐群串行发送，群与群之间随机等待 gapMin ~ gapMax 秒（前端可自定义，不设群数上限）。
     * 整轮只落一条「功能调用日志」（source = api，面板显示为「接口」），
     * 各群的发送结果用 ⏎ 合并进 sent，避免每群一条把日志刷屏。
     */
    post('/send', async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;

        // 群号：去重、保序、逐个校验（不限制数量，但会按间隔串行发）
        const seen = new Set<string>();
        const groups: string[] = [];
        for (const item of Array.isArray(body.groups) ? body.groups : []) {
            const gid = String(item ?? '').trim();
            if (!gid || seen.has(gid)) continue;
            if (!/^\d{5,12}$/.test(gid)) return fail(res, 400, `群号格式不正确：${gid}`);
            seen.add(gid);
            groups.push(gid);
        }
        if (!groups.length) return fail(res, 400, '请至少选择一个群');

        // 本轮只做纯文本 + @全体成员：正文必填（只有 @ 没有正文的消息会被协议端拒收）
        const content = typeof body.text === 'string' ? body.text.trim() : '';
        if (!content) return fail(res, 400, '正文不能为空');

        const atAll = body.atAll === true;

        if (!isPluginEnabled()) return fail(res, 503, '插件总开关已关闭，请先在「全局设置」里打开');

        const gapMin = gapOf(body.gapMin, 1);
        const gapMax = gapOf(body.gapMax, 3);

        // @ 与正文之间留一个空格：QQ 里显示为「@全体成员 正文」，不粘在一起
        const atLabel = atAll ? '@全体成员' : '';
        const summary = atLabel ? `${atLabel} ${content}` : content;

        const segments: Seg[] = [];
        if (atAll) segments.push(at('all'));
        segments.push(seg('text', { text: atLabel ? ` ${content}` : content }));

        const activity = beginActivity({
            source: 'api',
            action: 'send',
            feature: 'system',
            groupId: groups.length === 1 ? groups[0] : '',
            input: `${groups.length} 个群：${summary}`,
        });

        const failed: { groupId: string; error: string }[] = [];
        const startedAtMs = Date.now();

        // withActivity：整轮把这条记录钉在栈顶 —— 群发要跑很久，期间群里可能有别的
        // 命令在跑，不钉住的话某条发送摘要会被记进那条命令的记录里
        await withActivity(activity, async () => {
            for (let i = 0; i < groups.length; i += 1) {
                const gid = groups[i];
                // 第一条不等待，之后每条前面随机停一下，降低被风控的概率
                if (i > 0) await sleep(randomInt(gapMin, gapMax) * 1000);
                try {
                    await callAction('send_group_msg', { group_id: gid, message: segments });
                    noteActivitySent(`群 ${gid}：${summary}`);
                } catch (e) {
                    failed.push({
                        groupId: gid,
                        error: e instanceof Error ? e.message : String(e),
                    });
                    // 只进 NapCat 控制台：失败明细已汇总在调用日志里，不必再刷 errors.log
                    ctx.logger.warn(`[群管助手] 群发失败 group=${gid}:`, e);
                }
            }
        });

        const okCount = groups.length - failed.length;
        const cost = ((Date.now() - startedAtMs) / 1000).toFixed(1);
        activity.finish(
            failed.length ? 'fail' : 'ok',
            failed.length
                ? `成功 ${okCount} / 失败 ${failed.length}，耗时 ${cost}s；失败：${failed
                      .map((item) => `${item.groupId}（${item.error}）`)
                      .join('；')}`
                : `全部成功，耗时 ${cost}s`,
        );

        ctx.logger.info(`[群管助手] 群发完成：${okCount}/${groups.length} 个群，耗时 ${cost}s`);
        res.json({ code: 0, data: { total: groups.length, ok: okCount, failed } });
    });

    /* ---------------- 群配置条目 ---------------- */

    get('/profiles', (_req, res) => {
        res.json({ code: 0, data: getProfiles() });
    });

    post('/profiles', (req, res) => {
        const body = req.body as { profiles?: unknown } | undefined;
        try {
            const result = saveProfiles(body?.profiles ?? []);
            if (!result.ok) return fail(res, 400, result.message ?? '校验失败');
            ctx.logger.info(`[群管助手] 群配置已保存，共 ${getProfiles().length} 条`);
            res.json({ code: 0, data: getProfiles() });
        } catch (e) {
            ctx.logger.error('[群管助手] 保存群配置失败:', e);
            fail(res, 500, String(e));
        }
    });

    post('/profiles/validate', (req, res) => {
        const body = req.body as { profiles?: unknown } | undefined;
        const result = validateProfiles(body?.profiles ?? []);
        if (!result.ok) return fail(res, 400, result.message);
        res.json({ code: 0, data: result.profiles.length });
    });

    post('/profiles/new', (_req, res) => {
        res.json({ code: 0, data: newProfile() });
    });

    /* ---------------- AI 接口测试 ---------------- */

    post('/ai/test', async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const str = (k: string, def = ''): string => {
            const v = body[k];
            return typeof v === 'string' ? v : def;
        };

        const result = await testAiConnection({
            baseUrl: str('base_url'),
            apiKey: str('api_key'),
            model: str('model', 'deepseek-chat'),
            prompt: str('prompt', DEFAULT_AI_PROMPT),
            timeoutMs: Number(body.timeout_ms ?? 10000) || 10000,
        });

        if (!result.ok) {
            ctx.logger.info(`[群管助手] AI 接口测试失败：${result.error}`);
            return fail(res, 400, result.error);
        }

        const verdict = parseAiVerdict(result.content);
        ctx.logger.info(`[群管助手] AI 接口测试成功，回复：${result.content.slice(0, 80)}`);
        res.json({ code: 0, data: { ok: true, reply: result.content, verdict } });
    });

    /* ---------------- 数据文件 ---------------- */

    get('/data/files', (_req, res) => {
        res.json({ code: 0, data: { dataPath: getDataDir(), files: listDataFiles() } });
    });

    /* ---------------- 群数据：禁言记录 ---------------- */

    get('/data/ban-records', (_req, res) => {
        res.json({ code: 0, data: { records: listBanRecords() } });
    });

    post('/data/ban-records/update', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const result = updateBanDuration(
            String(body.groupId ?? ''),
            String(body.userId ?? ''),
            Number(body.duration),
        );
        if (!result.ok) return fail(res, 400, result.message);
        res.json({ code: 0, data: { records: listBanRecords() } });
    });

    post('/data/ban-records/remove', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!removeBanRow(String(body.groupId ?? ''), String(body.userId ?? ''))) {
            return fail(res, 404, '这条禁言记录已经不存在了');
        }
        res.json({ code: 0, data: { records: listBanRecords() } });
    });

    post('/data/ban-records/clear', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const groupId = typeof body.groupId === 'string' && body.groupId ? body.groupId : undefined;
        const removed = clearBanRecords(groupId);
        res.json({ code: 0, data: { records: listBanRecords(), removed } });
    });

    /* ---------------- 群数据：黑历史 ---------------- */

    get('/data/black-history', (_req, res) => {
        res.json({ code: 0, data: { records: listBlackRecordRows() } });
    });

    post('/data/black-history/add', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const userId = String(body.userId ?? '').trim();
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (!/^\d{5,12}$/.test(userId)) return fail(res, 400, 'QQ 号格式不正确');
        if (!text) return fail(res, 400, '正文不能为空');

        const id = addBlackRecord(userId, text, String(body.groupId ?? ''));
        res.json({ code: 0, data: { records: listBlackRecordRows(), id } });
    });

    post('/data/black-history/update', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const id = Number(body.id);
        if (!Number.isFinite(id)) return fail(res, 400, '缺少要修改的编号');

        const userId = body.userId === undefined ? undefined : String(body.userId).trim();
        const text = typeof body.text === 'string' ? body.text.trim() : undefined;
        const groupId = body.groupId === undefined ? undefined : String(body.groupId);
        if (userId !== undefined && !/^\d{5,12}$/.test(userId)) {
            return fail(res, 400, 'QQ 号格式不正确');
        }
        if (text !== undefined && !text) return fail(res, 400, '正文不能为空');

        if (!updateBlackRecord(id, { userId, text, groupId })) {
            return fail(res, 404, `没有找到编号为 ${id} 的黑历史`);
        }
        res.json({ code: 0, data: { records: listBlackRecordRows() } });
    });

    post('/data/black-history/remove', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const raw = body.ids;
        const ids = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
        const removed = removeBlackRecords(ids as Array<number | string>);
        res.json({ code: 0, data: { records: listBlackRecordRows(), removed } });
    });

    post('/data/black-history/clear', (_req, res) => {
        const removed = clearBlackHistory();
        res.json({ code: 0, data: { records: listBlackRecordRows(), removed } });
    });

    /**
     * 解除禁言并删掉记录。
     *
     * 只调接口、不发任何群消息（群里的 ban 命令才会播报）。
     * set_group_ban 是操作型接口，成功失败都只抛「No data returned」，
     * 对方不在群里也拿不到明确回执，所以这里失败只记日志，记录照删。
     */
    post('/data/ban-records/unban', async (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const groupId = String(body.groupId ?? '').trim();
        const userId = String(body.userId ?? '').trim();
        if (!groupId || !userId) return fail(res, 400, '缺少群号或 QQ 号');

        try {
            await ctx.actions.call(
                'set_group_ban',
                { group_id: groupId, user_id: userId, duration: 0 },
                ctx.adapterName,
                ctx.pluginManager.config,
            );
        } catch (e) {
            ctx.logger.warn('[群管助手] 解除禁言失败:', e);
        }

        removeBanRow(groupId, userId);
        res.json({ code: 0, data: { records: listBanRecords() } });
    });

    post('/data/ban-records/migrate', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const targetGroupId = String(body.targetGroupId ?? '').trim();
        if (!/^\d{5,12}$/.test(targetGroupId)) return fail(res, 400, '目标群号格式不正确');

        const result = migrateBanRecord(
            String(body.groupId ?? ''),
            String(body.userId ?? ''),
            targetGroupId,
        );
        if (!result.ok) return fail(res, 400, result.message);
        res.json({ code: 0, data: { records: listBanRecords() } });
    });

    /* ---------------- 群数据：撤回记录 ---------------- */

    get('/data/recall-records', (_req, res) => {
        res.json({ code: 0, data: { records: listRecallRows() } });
    });

    post('/data/recall-records/migrate', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const targetGroupId = String(body.targetGroupId ?? '').trim();
        if (!/^\d{5,12}$/.test(targetGroupId)) return fail(res, 400, '目标群号格式不正确');

        const result = migrateRecallUser(
            String(body.groupId ?? ''),
            String(body.userId ?? ''),
            targetGroupId,
        );
        if (!result.ok) return fail(res, 400, result.message);
        res.json({ code: 0, data: { records: listRecallRows() } });
    });

    post('/data/recall-records/remove', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!removeRecallUser(String(body.groupId ?? ''), String(body.userId ?? ''))) {
            return fail(res, 404, '这条撤回记录已经不存在了');
        }
        res.json({ code: 0, data: { records: listRecallRows() } });
    });

    post('/data/recall-records/clear', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const groupId = typeof body.groupId === 'string' && body.groupId ? body.groupId : undefined;
        const removed = clearRecallRecords(groupId);
        res.json({ code: 0, data: { records: listRecallRows(), removed } });
    });

    /* ---------------- 群数据：sm / smplus 禁言统计 ---------------- */

    get('/data/sm-stats', (_req, res) => {
        res.json({ code: 0, data: { records: listSmStats() } });
    });

    post('/data/sm-stats/remove', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        if (!removeSmStat(String(body.userId ?? ''))) {
            return fail(res, 404, '这个用户的禁言统计已经不在了');
        }
        res.json({ code: 0, data: { records: listSmStats() } });
    });

    /* ---------------- 群数据：拉黑名单 ---------------- */

    get('/data/blacklist', (_req, res) => {
        res.json({ code: 0, data: { records: listBlacklistRows() } });
    });

    /* ---------------- 群信息 ---------------- */

    /**
     * 某个群的群主与管理员（AI 失败通知对象级联菜单的右侧列表用）。
     *
     * 走本地记录：第一次实时拉取并落盘，之后直接读记录，靠群通知增量更新
     * （见 services/group-managers.ts）。带 ?refresh=1 时强制重新实时拉取。
     * name 取群名片，没有就用昵称；bot 不在群里 / 拉取失败且无本地记录时返回
     * 空结果并带 error 说明，前端据此提示，而不是让请求挂掉。
     */
    get('/group/managers', async (req, res) => {
        const groupId = String(req.query.groupId ?? '').trim();
        if (!/^\d{5,12}$/.test(groupId)) return fail(res, 400, '群号格式不正确');

        const refresh = String(req.query.refresh ?? '') === '1';
        const data = await getGroupManagers(groupId, { refresh });
        res.json({ code: 0, data });
    });

    post('/data/blacklist/remove', (req, res) => {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const profileId = String(body.profileId ?? '').trim();
        if (!profileId) return fail(res, 400, '缺少配置组 id');
        if (!removeFromBlacklist(profileId, String(body.userId ?? ''))) {
            return fail(res, 404, '这个用户的拉黑记录已经不在了');
        }
        res.json({ code: 0, data: { records: listBlacklistRows() } });
    });

    /* ---------------- 错误记录 ---------------- */

    get('/errors', (req, res) => {
        const limit = Math.min(Number(req.query?.limit) || 50, 200);
        res.json({ code: 0, data: { records: recentErrors(limit), startedAt } });
    });

    get('/activity', (req, res) => {
        const limit = Math.min(Number(req.query?.limit) || 50, 200);
        res.json({ code: 0, data: { records: recentActivities(limit), startedAt } });
    });

    /* ---------------- 日志导出 / 清空 ---------------- */

    const LOG_FILES: Record<string, string> = {
        errors: 'errors.log',
        activity: 'activity.log',
    };

    /** 下载原始日志文件（text/plain，前端用 downloadFile 存盘） */
    get('/logs/file', (req, res) => {
        const name = String(req.query?.name ?? '');
        const file = LOG_FILES[name];
        if (!file) {
            fail(res, 400, `未知日志：${name || '(空)'}`);
            return;
        }
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
        res.send(readLogFile(file));
    });

    /** 清空 errors.log / activity.log（含内存缓冲；清 errors 时异常计数一并归零） */
    post('/logs/clear', (req, res) => {
        const body = req.body as { target?: string } | undefined;
        const target = String(body?.target ?? '');
        const targets = target === 'both' ? ['errors', 'activity'] : [target];

        if (!targets.every((item) => LOG_FILES[item])) {
            fail(res, 400, `未知日志：${target || '(空)'}`);
            return;
        }

        const cleared: string[] = [];
        const failed: { name: string; error: string }[] = [];
        for (const item of targets) {
            try {
                if (item === 'errors') clearErrorLog();
                else clearActivityLog();
                cleared.push(LOG_FILES[item]);
            } catch (e) {
                failed.push({
                    name: LOG_FILES[item],
                    error: e instanceof Error ? e.message : String(e),
                });
            }
        }

        // 一个都没清成功 → 直接报错，别让界面以为清掉了
        if (!cleared.length) {
            fail(res, 500, failed.map((item) => item.error).join('；'));
            return;
        }
        res.json({ code: 0, data: { cleared, failed } });
    });

    /* ---------------- 重复加群检测 ---------------- */

    get('/duplicates/snapshot', (_req, res) => {
        res.json({ code: 0, data: snapshotInfo() });
    });

    post('/duplicates/export', async (req, res) => {
        const body = req.body as { groupIds?: string[] } | undefined;
        const list = Array.isArray(body?.groupIds) ? body.groupIds : [];
        if (!list.length) return fail(res, 400, '请先勾选要导出的群');
        try {
            const result = await exportSnapshot(list);
            res.json({ code: 0, data: { ...result, snapshot: snapshotInfo() } });
        } catch (e) {
            ctx.logger.error('[群管助手] 导出群成员快照失败:', e);
            fail(res, 500, String(e));
        }
    });

    /* 下载快照文件（浏览器直接存盘，可用于备份 / 换机迁移） */
    get('/duplicates/snapshot/file', (_req, res) => {
        try {
            const { filename, content } = readSnapshotFile();
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
            );
            res.send(content);
        } catch (e) {
            fail(res, 404, e instanceof Error ? e.message : String(e));
        }
    });

    /* 导入快照文件内容（给 bot 不在的群补充成员名单） */
    post('/duplicates/snapshot/import', (req, res) => {
        const body = req.body as { content?: string } | undefined;
        const content = typeof body?.content === 'string' ? body.content : '';
        if (!content.trim()) return fail(res, 400, '没有读到文件内容');
        try {
            const result = importSnapshot(content);
            res.json({ code: 0, data: { ...result, snapshot: snapshotInfo() } });
        } catch (e) {
            fail(res, 400, e instanceof Error ? e.message : String(e));
        }
    });

    /* 清理快照文件 */
    post('/duplicates/snapshot/clear', (_req, res) => {
        const removed = clearSnapshot();
        res.json({ code: 0, data: { cleared: removed, snapshot: snapshotInfo() } });
    });

    ctx.logger.debug('[群管助手] API 路由注册完成');
}

export type { PluginHttpRequest };

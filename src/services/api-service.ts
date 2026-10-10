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
import { findProfileByGroup, newProfile, saveProfiles, validateProfiles } from '../core/profiles';
import {
    clearSnapshot,
    exportSnapshot,
    importSnapshot,
    readSnapshotFile,
    snapshotInfo,
} from './dup-check';
import { getGlobal, getProfiles, recentErrors, startedAt, stats, updateGlobal, uptimeText } from '../core/state';
import { getDataDir, listDataFiles } from '../core/store';

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

    /* 所有接口都过一遍密码守卫 */
    const get = (path: string, handler: PluginRequestHandler): void => {
        router.getNoAuth(path, guard(handler));
    };
    const post = (path: string, handler: PluginRequestHandler): void => {
        router.postNoAuth(path, guard(handler));
    };

    /* ---------------- 状态 ---------------- */

    get('/status', (_req, res) => {
        const profiles = getProfiles();
        res.json({
            code: 0,
            data: {
                pluginName: ctx.pluginName,
                version: '0.1.0',
                uptime: uptimeText(),
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

    /* ---------------- 错误记录 ---------------- */

    get('/errors', (req, res) => {
        const limit = Math.min(Number(req.query?.limit) || 50, 200);
        res.json({ code: 0, data: { records: recentErrors(limit), startedAt } });
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

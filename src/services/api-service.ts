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
} from 'napcat-types/napcat-onebot/network/plugin/types';

import { DEFAULT_GLOBAL, DEFAULT_JUDGE_WORDS, FEATURES, FEATURE_KEYS } from '../constants';
import { findProfileByGroup, newProfile, saveProfiles, validateProfiles } from '../core/profiles';
import { getGlobal, getProfiles, stats, updateGlobal, uptimeText } from '../core/state';
import { getDataDir, listDataFiles } from '../core/store';
import { importFromLegacy } from './legacy-import';

function fail(res: PluginHttpResponse, code: number, message: string): void {
    res.status(code).json({ code: -1, message });
}

export function registerApiRoutes(ctx: NapCatPluginContext): void {
    const router = ctx.router;

    /* ---------------- 状态 ---------------- */

    router.getNoAuth('/status', (_req, res) => {
        const profiles = getProfiles();
        res.json({
            code: 0,
            data: {
                pluginName: ctx.pluginName,
                version: '0.1.0',
                uptime: uptimeText(),
                dataPath: getDataDir(),
                stats: { ...stats },
                global: getGlobal(),
                summary: {
                    profiles: profiles.length,
                    groups: profiles.reduce((n, p) => n + p.group_ids.length, 0),
                    files: listDataFiles().length,
                },
            },
        });
    });

    /* ---------------- 元信息 ---------------- */

    router.getNoAuth('/meta', (_req, res) => {
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

    router.getNoAuth('/config', (_req, res) => {
        res.json({ code: 0, data: getGlobal() });
    });

    router.postNoAuth('/config', (req, res) => {
        const body = req.body as Record<string, unknown> | undefined;
        if (!body) return fail(res, 400, '请求体为空');
        try {
            const global = updateGlobal(body);
            ctx.logger.info('[群管助手] 全局配置已更新');
            res.json({ code: 0, data: global });
        } catch (e) {
            ctx.logger.error('[群管助手] 保存全局配置失败:', e);
            fail(res, 500, String(e));
        }
    });

    /* ---------------- 群列表 ---------------- */

    router.getNoAuth('/groups', async (_req, res) => {
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

    router.getNoAuth('/profiles', (_req, res) => {
        res.json({ code: 0, data: getProfiles() });
    });

    router.postNoAuth('/profiles', (req, res) => {
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

    router.postNoAuth('/profiles/validate', (req, res) => {
        const body = req.body as { profiles?: unknown } | undefined;
        const result = validateProfiles(body?.profiles ?? []);
        if (!result.ok) return fail(res, 400, result.message);
        res.json({ code: 0, data: result.profiles.length });
    });

    router.postNoAuth('/profiles/new', (_req, res) => {
        res.json({ code: 0, data: newProfile() });
    });

    /* ---------------- 数据文件 ---------------- */

    router.getNoAuth('/data/files', (_req, res) => {
        res.json({ code: 0, data: { dataPath: getDataDir(), files: listDataFiles() } });
    });

    /* ---------------- 旧配置导入 ---------------- */

    router.postNoAuth('/import', (req, res) => {
        const body = req.body as { dir?: string; overwriteData?: boolean } | undefined;
        const dir = typeof body?.dir === 'string' ? body.dir.trim() : '';
        if (!dir) return fail(res, 400, '请填写旧插件 config 目录的绝对路径');

        try {
            const result = importFromLegacy(dir, body?.overwriteData === true);
            if (!result.ok) return fail(res, 400, result.message);
            ctx.logger.info(`[群管助手] ${result.message}`);
            res.json({ code: 0, data: result });
        } catch (e) {
            ctx.logger.error('[群管助手] 导入失败:', e);
            fail(res, 500, String(e));
        }
    });

    ctx.logger.debug('[群管助手] API 路由注册完成');
}

export type { PluginHttpRequest };

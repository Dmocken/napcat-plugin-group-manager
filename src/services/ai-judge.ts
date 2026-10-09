/**
 * 入群答案的 AI 语义判断（OpenAI 兼容接口，默认 DeepSeek）
 *
 * 约定：模型只输出 1 或 0 —— 1 表示通过、0 表示拒绝。
 * 调用失败（网络 / 超时 / HTTP 错误 / 返回不可解析）时 judgeByAi 返回 null，
 * 由调用方决定怎么处理（当前实现是通知 Bot 管理员并跳过自动审批）。
 *
 * 只用 Node 自带的 fetch，不引入任何依赖，方便随插件一起打包。
 */

import { logDebug, logError } from '../core/state';
import { renderText } from '../core/texts';

export interface AiJudgeConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    /** 提示词模板，支持 {question} / {answer} */
    prompt: string;
    timeoutMs: number;
}

/** 单次调用结果：成功带回模型原始回复，失败带回原因 */
export type AiCallResult = { ok: true; content: string } | { ok: false; error: string };

/** 把根地址拼成 chat/completions（兼容用户填/不填 /v1） */
function completionsUrl(baseUrl: string): string {
    const base = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    if (/\/chat\/completions$/.test(base)) return base;
    return `${base}/chat/completions`;
}

/** 从模型回复里解析 1 / 0（取第一个出现的数字字符） */
export function parseAiVerdict(content: string): boolean | null {
    const text = String(content ?? '').trim();
    if (!text) return null;
    const m = text.match(/[01]/);
    if (m) return m[0] === '1';
    // 兜底：个别模型会回「同意/不同意」
    if (/同意|愿意|通过/.test(text)) return true;
    if (/不同意|拒绝|不通过/.test(text)) return false;
    return null;
}

/**
 * 调用一次 chat/completions，返回模型原始回复
 * 供「入群审核判断」和「测试 API Key 按钮」共用
 */
export async function callAiChat(
    cfg: AiJudgeConfig,
    question: string,
    answer: string,
): Promise<AiCallResult> {
    const url = completionsUrl(cfg.baseUrl);
    if (!url) return { ok: false, error: '未填写接口地址' };
    if (!cfg.apiKey) return { ok: false, error: '未填写 API Key' };
    if (typeof globalThis.fetch !== 'function') {
        return { ok: false, error: '当前 Node 运行环境没有全局 fetch（建议升级 NapCat / Node 18+）' };
    }

    const prompt = renderText(cfg.prompt || '', { question, answer });
    const timeoutMs = Math.max(1000, Math.floor(Number(cfg.timeoutMs) || 10000));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${cfg.apiKey}`,
            },
            body: JSON.stringify({
                model: cfg.model || 'deepseek-chat',
                messages: [{ role: 'user', content: prompt }],
                stream: false,
                temperature: 0,
            }),
            signal: controller.signal,
        });

        const text = await res.text();
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}：${text.slice(0, 200)}` };

        try {
            const json = JSON.parse(text) as {
                choices?: Array<{ message?: { content?: string } }>;
            };
            const content = String(json.choices?.[0]?.message?.content ?? '');
            if (!content) return { ok: false, error: `返回内容为空：${text.slice(0, 200)}` };
            return { ok: true, content };
        } catch {
            return { ok: false, error: `返回不是合法 JSON：${text.slice(0, 200)}` };
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const aborted = /abort/i.test(msg);
        return { ok: false, error: aborted ? `${timeoutMs}ms 内没有响应（超时）` : msg };
    } finally {
        clearTimeout(timer);
    }
}

/**
 * 调用 AI 判断答案是否表达「愿意」
 * @returns true 通过 / false 拒绝 / null 判断失败（网络、超时、格式异常）
 */
export async function judgeByAi(
    cfg: AiJudgeConfig,
    question: string,
    answer: string,
): Promise<boolean | null> {
    const result = await callAiChat(cfg, question, answer);
    if (!result.ok) {
        logError(`[群管助手] AI 判断失败：${result.error}`);
        return null;
    }

    const verdict = parseAiVerdict(result.content);
    logDebug(`[群管助手] AI 判断结果=${verdict} 原始回复=${JSON.stringify(result.content.slice(0, 60))}`);
    if (verdict === null) {
        logError(`[群管助手] AI 回复无法解析出 1/0：${JSON.stringify(result.content.slice(0, 120))}`);
    }
    return verdict;
}

/** 供「测试 API Key」使用：返回模型回复或失败原因 */
export async function testAiConnection(
    cfg: AiJudgeConfig,
    question = '你喜欢这个群吗？',
    answer = '喜欢，很想加入',
): Promise<AiCallResult> {
    return callAiChat(cfg, question, answer);
}

/**
 * 加群答案语义判断（关键词模式，不依赖 jieba）
 *
 * 移植自旧 NoneBot 版 group_join_verify.py 的「最早信号优先」策略：
 *   - 先出现「同意信号」→ 通过，后面补充的说明（如"但我不能保证每天在线"）不会再翻转结果
 *   - 先出现「拒绝信号」→ 拒绝
 *   - 同意词前面 3 个字符内出现否定修饰词 → 视为拒绝（"不同意"）
 *   - 但被"没说 / 没有 / 不是 / 并非"这类双重否定触发词覆盖时，否定被抵消（"没说不愿意" = 愿意）
 *   - 完全没信号 → 拒绝
 */

import { DEFAULT_JUDGE_WORDS } from '../constants';

export interface JudgeWords {
    agree: string[];
    negation: string[];
    reject: string[];
    double_negation: string[];
}

/** 从 params.words 读取词表，缺失项回退默认 */
export function resolveWords(raw: unknown): JudgeWords {
    const src = (raw ?? {}) as Partial<JudgeWords>;
    const pick = (key: keyof JudgeWords) =>
        Array.isArray(src[key]) && (src[key] as string[]).length
            ? (src[key] as string[]).map((w) => String(w))
            : DEFAULT_JUDGE_WORDS[key];

    return {
        agree: pick('agree'),
        negation: pick('negation'),
        reject: pick('reject'),
        double_negation: pick('double_negation'),
    };
}

/** 否定覆盖窗口（字符数） */
const NEGATION_WINDOW = 3;
/** 双重否定触发词的覆盖窗口（字符数） */
const DOUBLE_NEGATION_WINDOW = 4;

/** 某个位置之前是否被双重否定触发词覆盖 */
function coveredByDoubleNegation(text: string, index: number, words: JudgeWords): boolean {
    const start = Math.max(0, index - DOUBLE_NEGATION_WINDOW);
    const prefix = text.slice(start, index);
    return words.double_negation.some((t) => prefix.includes(t.toLowerCase()));
}

/** 最早出现的拒绝信号位置（-1 表示没有）；被双重否定覆盖的不算 */
function firstRejectIndex(text: string, words: JudgeWords): number {
    let best = -1;
    for (const word of words.reject) {
        const w = word.toLowerCase();
        let from = 0;
        for (;;) {
            const idx = text.indexOf(w, from);
            if (idx < 0) break;
            from = idx + w.length;
            // "没说不愿意" 这类：拒绝词被双重否定覆盖 → 视为同意信号，不算拒绝
            if (coveredByDoubleNegation(text, idx, words)) continue;
            if (best < 0 || idx < best) best = idx;
            break;
        }
    }
    return best;
}

/** 最早出现的同意信号位置；被否定修饰的同意词记为「拒绝信号」 */
function firstSignals(text: string, words: JudgeWords): { agree: number; negated: number } {
    let agree = -1;
    let negated = -1;

    for (const word of words.agree) {
        const w = word.toLowerCase();
        let from = 0;
        for (;;) {
            const idx = text.indexOf(w, from);
            if (idx < 0) break;
            from = idx + w.length;

            const windowStart = Math.max(0, idx - NEGATION_WINDOW);
            const prefix = text.slice(windowStart, idx);
            const hasNegation = words.negation.some((n) => prefix.includes(n.toLowerCase()));

            if (!hasNegation) {
                if (agree < 0 || idx < agree) agree = idx;
                break; // 该词的最早「未被否定」出现已足够
            }

            if (coveredByDoubleNegation(text, idx, words)) {
                // 双重否定 → 实际是同意
                if (agree < 0 || idx < agree) agree = idx;
                break;
            }

            if (negated < 0 || idx < negated) negated = idx;
        }
    }

    return { agree, negated };
}

/**
 * 判断答案是否表达了「同意加群」
 * @param answer 用户填写的入群答案
 * @param words 词表（来自群配置）
 */
export function judgeAnswer(answer: string, words: JudgeWords = DEFAULT_JUDGE_WORDS): boolean {
    const text = (answer ?? '').trim().toLowerCase();
    if (!text) return false;

    const rejectAt = firstRejectIndex(text, words);
    const { agree, negated } = firstSignals(text, words);

    // 统一成「拒绝信号」：显式拒绝词 + 被否定的同意词
    let refuseAt = -1;
    for (const idx of [rejectAt, negated]) {
        if (idx >= 0 && (refuseAt < 0 || idx < refuseAt)) refuseAt = idx;
    }

    if (agree < 0) return false;
    if (refuseAt < 0) return true;
    return agree < refuseAt;
}

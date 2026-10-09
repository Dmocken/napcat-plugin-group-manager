/**
 * 通用工具：时长解析/格式化、时间戳归一化、参数取值
 */

/** 秒数 → 人类可读中文时长（3天 / 2小时 / 5分钟 / 30秒） */
export function formatDuration(seconds: number): string {
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)}天`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)}小时`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}分钟`;
    return `${seconds}秒`;
}

/** 解析「时长 + 单位」，无法解析返回 0 */
export function parseDuration(value: string, unit: string): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    switch (unit) {
        case '秒':
        case 's':
        case 'S':
            return Math.floor(n);
        case '分':
        case 'm':
        case 'M':
            return Math.floor(n * 60);
        case '时':
        case 'h':
        case 'H':
            return Math.floor(n * 3600);
        case '天':
        case 'd':
        case 'D':
            return Math.floor(n * 86400);
        default:
            return 0;
    }
}

/** 部分协议端返回毫秒时间戳，统一转成秒 */
export function toSeconds(ts: number): number {
    const n = Number(ts) || 0;
    if (n > 1_000_000_000_000) return Math.floor(n / 1000);
    return Math.floor(n);
}

/** 时间戳（秒）→ YYYY-MM-DD HH:MM:SS */
export function formatTime(ts: number): string {
    if (!ts || ts <= 0) return '未知';
    const d = new Date(ts * 1000);
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
        d.getMinutes(),
    )}:${pad(d.getSeconds())}`;
}

/** HH:MM:SS */
export function formatClock(date: Date): string {
    const pad = (v: number) => String(v).padStart(2, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** [min, max] 闭区间随机整数 */
export function randomInt(min: number, max: number): number {
    const lo = Math.min(min, max);
    const hi = Math.max(min, max);
    return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/** 从 settings.params 取数字 */
export function paramNumber(params: Record<string, unknown>, key: string, def: number): number {
    const v = Number(params?.[key]);
    return Number.isFinite(v) ? v : def;
}

/** 从 settings.params 取字符串 */
export function paramString(params: Record<string, unknown>, key: string, def: string): string {
    const v = params?.[key];
    return typeof v === 'string' && v ? v : def;
}

/** 从 settings.params 取数字数组 */
export function paramNumberList(params: Record<string, unknown>, key: string, def: number[]): number[] {
    const v = params?.[key];
    if (!Array.isArray(v)) return def;
    const list = v.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    return list.length ? list : def;
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { useServerNow } from './server-clock';

/** shadcn/ui 约定的类名合并工具 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs));
}

/** 深拷贝参数默认值，避免多条群配置共享同一份对象 */
export function cloneDefault<T>(value: T): T {
    if (value && typeof value === 'object') {
        return JSON.parse(JSON.stringify(value)) as T;
    }
    return value;
}

/** 群号 / QQ 号格式校验 */
export const QQ_RE = /^\d{5,12}$/;

export function isQq(value: string): boolean {
    return QQ_RE.test(value);
}

/** 临时 textarea + execCommand 复制：老 API，但在 iframe / 非安全上下文里最可靠 */
function copyViaTextarea(value: string): boolean {
    try {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.dataset.copyFallback = '1';
        // 固定在视口外，避免页面跳动；必须留在文档里才能 select
        area.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0;';
        document.body.appendChild(area);
        area.select();
        area.setSelectionRange(0, area.value.length);
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    } catch {
        return false;
    }
}

function clearFallbackAreas(): void {
    document.querySelectorAll('textarea[data-copy-fallback]').forEach((node) => node.remove());
}

/**
 * 复制文本。
 *
 * NapCat WebUI 里页面可能被嵌在 iframe / 非安全上下文（局域网 http）中，
 * 这时 navigator.clipboard 不存在或抛 NotAllowedError，因此保留 execCommand 兜底；
 * 两条路都失败才返回 false，由调用方提示用户手动复制。
 */
export async function copyText(value: string): Promise<boolean> {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(value);
            return true;
        } catch {
            /* 权限被拒 / 页面未聚焦，继续走兜底 */
        }
    }

    const ok = copyViaTextarea(value);
    clearFallbackAreas();
    return ok;
}

/** 复制失败时的兜底：把文本选中并聚焦，用户直接按 Ctrl/⌘ + C 即可 */
export function selectForManualCopy(value: string): boolean {
    clearFallbackAreas();
    try {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.dataset.copyFallback = '1';
        // 要能聚焦才吃得到 Ctrl+C，所以留在视口内，但几乎不可见
        area.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
        document.body.appendChild(area);
        area.focus();
        area.select();
        area.setSelectionRange(0, area.value.length);
        return document.activeElement === area;
    } catch {
        return false;
    }
}

/** 秒数 → 运行时长文案（与后端 uptimeText 保持一致的呈现规则） */
export function formatUptime(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}天${h}小时`;
    if (h > 0) return `${h}小时${m}分钟`;
    if (m > 0) return `${m}分钟${sec}秒`;
    return `${sec}秒`;
}

/**
 * 运行时长实时走秒。
 *
 * 后端在 `/status` 里同时给出「服务端时间」与「已运行秒数」，两者相减就是插件启动
 * 时刻的绝对值；之后每秒用服务端时钟回推现在运行了多久。这样轮询刷新不会让读数
 * 跳变，客户端时钟被改也不受影响（细节见 lib/server-clock.ts）。
 *
 * serverTimeMs 是服务端毫秒时间戳，seconds 是同一时刻的运行秒数。
 */
export function useLiveUptime(
    seconds: number | undefined,
    serverTimeMs: number | undefined,
): number | undefined {
    const now = useServerNow();

    if (seconds === undefined || serverTimeMs === undefined) return undefined;
    // 插件启动时刻（服务端秒）= 服务端当前秒 − 已运行秒数
    return Math.max(0, now - (serverTimeMs / 1000 - seconds));
}

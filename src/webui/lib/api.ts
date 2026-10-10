/**
 * 后端接口封装。
 *
 * 页面可能被挂在三种路径下（/page/dashboard、/api/ui、/files/static/*），
 * 因此 BASE 通过剥离最后一段已知前缀来推断，接口统一挂在 BASE + '/api'。
 */

const BASE = location.pathname.replace(/\/(page|files|api)\/.*$/, '');
export const API_BASE = `${BASE}/api`;

const PWD_KEY = 'napcat-group-manager-pwd';

/** 未通过密码校验（HTTP 401） */
export class NeedPasswordError extends Error {
    constructor() {
        super('需要访问密码');
        this.name = 'NeedPasswordError';
    }
}

export function savedPassword(): string {
    try {
        return localStorage.getItem(PWD_KEY) || '';
    } catch {
        return '';
    }
}

export function savePassword(value: string): void {
    try {
        if (value) localStorage.setItem(PWD_KEY, value);
        else localStorage.removeItem(PWD_KEY);
    } catch {
        /* 隐私模式下忽略 */
    }
}

export interface RequestOptions {
    method?: 'GET' | 'POST';
    body?: unknown;
}

interface ApiEnvelope<T> {
    code?: number;
    data?: T;
    message?: string;
}

/** 带鉴权头下载文件并触发浏览器存盘（a[download] 不能带 header，所以走 fetch + Blob） */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
    const headers: Record<string, string> = {};
    const pwd = savedPassword();
    if (pwd) headers['x-plugin-password'] = pwd;

    const res = await fetch(API_BASE + path, { headers });
    if (res.status === 401) throw new NeedPasswordError();
    if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
            const json = (await res.json()) as ApiEnvelope<unknown>;
            if (json?.message) message = json.message;
        } catch {
            /* 非 JSON 响应，沿用状态码 */
        }
        throw new Error(message);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fallbackName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const pwd = savedPassword();
    if (pwd) headers['x-plugin-password'] = pwd;

    const res = await fetch(API_BASE + path, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (res.status === 401) throw new NeedPasswordError();

    let json: ApiEnvelope<T> = { code: -1, message: `HTTP ${res.status}` };
    try {
        json = (await res.json()) as ApiEnvelope<T>;
    } catch {
        /* 非 JSON 响应，保留默认值 */
    }

    if (json && json.code === 0) return json.data as T;
    throw new Error(json?.message || '请求失败');
}

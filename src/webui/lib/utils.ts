import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

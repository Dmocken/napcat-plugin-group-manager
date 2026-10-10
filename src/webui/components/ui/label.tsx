import * as React from 'react';

import { cn } from '@/lib/utils';

interface FieldProps {
    label?: React.ReactNode;
    /** 字段下方的补充说明（灰阶小字） */
    hint?: React.ReactNode;
    /** 标签右侧的额外标记，如「必填」「已修改」 */
    badge?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}

/**
 * 表单字段容器：上方标签 + 下方控件 + 可选说明。
 * 刻意使用 div 而非 label 包裹，避免与 Switch / Checkbox 产生双触发。
 */
export function Field({ label, hint, badge, className, children }: FieldProps): React.JSX.Element {
    return (
        <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
            {label || badge ? (
                <div className="flex items-baseline gap-2">
                    {label ? <span className="text-[13px] text-ink-2">{label}</span> : null}
                    {badge}
                </div>
            ) : null}
            {children}
            {hint ? <span className="text-xs leading-relaxed text-subtle">{hint}</span> : null}
        </div>
    );
}

/** 横向字段：左侧固定宽度标签，右侧控件占满剩余宽度 */
export function RowField({
    label,
    hint,
    className,
    children,
}: {
    label: React.ReactNode;
    hint?: React.ReactNode;
    className?: string;
    children: React.ReactNode;
}): React.JSX.Element {
    return (
        <div className={cn('grid grid-cols-[180px_minmax(0,1fr)] items-start gap-4', className)}>
            <div className="pt-2">
                <div className="text-[13px] text-ink-2">{label}</div>
                {hint ? <div className="mt-0.5 text-xs text-subtle">{hint}</div> : null}
            </div>
            <div className="min-w-0">{children}</div>
        </div>
    );
}
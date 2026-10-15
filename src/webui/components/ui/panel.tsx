import * as React from 'react';

import { cn } from '@/lib/utils';

/* ---------------- 面板容器 ---------------- */

export function Panel({
    className,
    ...props
}: React.HTMLAttributes<HTMLElement>): React.JSX.Element {
    return (
        <section
            className={cn('rounded-panel border border-line bg-surface', className)}
            {...props}
        />
    );
}

interface PanelHeaderProps {
    title: React.ReactNode;
    description?: React.ReactNode;
    /** 标题左侧图标 */
    icon?: React.ReactNode;
    /** 右侧操作区 */
    actions?: React.ReactNode;
    className?: string;
}

export function PanelHeader({
    title,
    description,
    icon,
    actions,
    className,
}: PanelHeaderProps): React.JSX.Element {
    return (
        <div
            className={cn(
                'flex items-start gap-3 border-b border-line px-5 py-4',
                actions && 'flex-wrap',
                className,
            )}
        >
            {/* 图标与标题行（leading-6）等高并垂直居中，避免比标题偏上 */}
            {icon ? (
                <span className="flex h-6 shrink-0 items-center text-muted">{icon}</span>
            ) : null}
            <div className="min-w-0 flex-1">
                <h2 className="text-[15px] leading-6 font-semibold text-ink">{title}</h2>
                {description ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
                ) : null}
            </div>
            {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </div>
    );
}

/* ---------------- 面板内分区标题 ---------------- */

export function SectionTitle({
    children,
    count,
    className,
}: {
    children: React.ReactNode;
    count?: React.ReactNode;
    className?: string;
}): React.JSX.Element {
    return (
        <div className={cn('flex items-center gap-2', className)}>
            <span className="text-[13px] font-semibold text-ink-2">{children}</span>
            {count !== undefined ? (
                <span className="rounded-full border border-line px-1.5 text-[11px] leading-4 text-subtle">
                    {count}
                </span>
            ) : null}
        </div>
    );
}

/* ---------------- 空状态 ---------------- */

export function EmptyState({
    icon,
    title,
    description,
    action,
    className,
}: {
    icon?: React.ReactNode;
    title: string;
    description?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}): React.JSX.Element {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-panel border border-dashed border-line px-6 py-14 text-center',
                className,
            )}
        >
            {icon ? <span className="text-subtle">{icon}</span> : null}
            <p className="text-sm font-medium text-ink-2">{title}</p>
            {description ? (
                <p className="max-w-[420px] text-xs leading-relaxed text-subtle">{description}</p>
            ) : null}
            {action ? <div className="mt-2">{action}</div> : null}
        </div>
    );
}
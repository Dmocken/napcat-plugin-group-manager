import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

interface TagProps {
    children: React.ReactNode;
    onRemove?: () => void;
    /** default = 描边；solid = 反色（用于强调项，如 Bot 管理员） */
    variant?: 'default' | 'solid';
    className?: string;
    title?: string;
}

export function Tag({
    children,
    onRemove,
    variant = 'default',
    className,
    title,
}: TagProps): React.JSX.Element {
    return (
        <span
            title={title}
            className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border py-[1px] pl-2 text-xs',
                variant === 'solid'
                    ? 'border-inverse bg-inverse text-inverse-ink'
                    : 'border-line bg-surface-2 text-ink-2',
                onRemove && 'pr-1',
                className,
            )}
        >
            <span className="truncate">{children}</span>
            {onRemove ? (
                <button
                    type="button"
                    aria-label="移除"
                    onClick={onRemove}
                    className="-mr-0.5 grid size-4 shrink-0 cursor-pointer place-items-center rounded-full text-subtle transition-colors hover:bg-line hover:text-ink"
                >
                    <X className="size-3" />
                </button>
            ) : null}
        </span>
    );
}
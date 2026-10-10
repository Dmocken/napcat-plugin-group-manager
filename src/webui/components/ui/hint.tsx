import * as React from 'react';

import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom';

interface HintProps {
    /** 提示内容，支持换行 */
    content: React.ReactNode;
    /** 触发元素（通常是图标按钮） */
    children: React.ReactNode;
    side?: Side;
    className?: string;
    /** 浮层宽度 */
    width?: number;
}

/**
 * 轻量悬浮提示：纯 CSS 实现，不引入额外依赖。
 * 鼠标悬停 / 键盘聚焦触发元素时显示。
 */
export function Hint({
    content,
    children,
    side = 'top',
    className,
    width = 300,
}: HintProps): React.JSX.Element {
    return (
        <span className={cn('group/hint relative inline-flex', className)}>
            {children}
            <span
                role="tooltip"
                style={{ width }}
                className={cn(
                    'pointer-events-none invisible absolute left-1/2 z-[120] -translate-x-1/2 rounded-control border border-line-strong bg-surface-3 px-2.5 py-2',
                    'text-xs leading-relaxed whitespace-pre-line text-ink opacity-0 shadow-pop',
                    'transition-opacity duration-100 group-hover/hint:visible group-hover/hint:opacity-100',
                    'group-focus-within/hint:visible group-focus-within/hint:opacity-100',
                    side === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
                )}
            >
                {content}
            </span>
        </span>
    );
}
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export const PopoverContent = React.forwardRef<
    React.ComponentRef<typeof PopoverPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
        /** 内容宽度，默认跟随触发器；传固定值可让浮层更宽 */
        width?: number;
        /**
         * 是否挂到 body（默认 true）。
         *
         * 放在 Radix 弹窗（modal）里时必须传 false：弹窗会给 body 加 `pointer-events: none`，
         * 挂到 body 的浮层既点不动、层级也压在弹窗底下；内联渲染则留在弹窗的层叠上下文里。
         */
        portal?: boolean;
    }
>(({ className, align = 'start', sideOffset = 6, width, portal = true, ...props }, ref) => {
    const content = (
        <PopoverPrimitive.Content
            ref={ref}
            align={align}
            sideOffset={sideOffset}
            className={cn(
                'gm-content z-[90] rounded-control border border-line-strong bg-surface p-2.5 shadow-pop focus:outline-none',
                width ? 'w-[var(--gm-pop-w)]' : 'w-[var(--radix-popover-trigger-width)]',
                className,
            )}
            style={width ? ({ '--gm-pop-w': `${width}px` } as React.CSSProperties) : undefined}
            {...props}
        />
    );

    return portal ? <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal> : content;
});
PopoverContent.displayName = 'PopoverContent';
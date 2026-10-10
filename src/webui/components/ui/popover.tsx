import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as React from 'react';

import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = React.forwardRef<
    React.ComponentRef<typeof PopoverPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
        /** 内容宽度，默认跟随触发器；传固定值可让浮层更宽 */
        width?: number;
    }
>(({ className, align = 'start', sideOffset = 6, width, ...props }, ref) => (
    <PopoverPrimitive.Portal>
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
    </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';
import * as React from 'react';

import { cn } from '@/lib/utils';

export const Textarea = React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
    <textarea
        ref={ref}
        className={cn(
            'min-h-[64px] w-full resize-y rounded-control border border-line bg-surface-2 px-2.5 py-1.5 text-sm leading-relaxed text-ink transition-colors',
            'placeholder:text-subtle hover:border-line-strong',
            'focus:border-ink-2 focus:outline-none disabled:opacity-40',
            className,
        )}
        {...props}
    />
));
Textarea.displayName = 'Textarea';
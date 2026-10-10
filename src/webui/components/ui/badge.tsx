import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-[1px] text-[11px] leading-5',
    {
        variants: {
            variant: {
                default: 'border-line text-muted',
                strong: 'border-line-strong bg-surface-2 text-ink',
                /** 未完成 / 未启用：虚线边框，纯灰阶里表达「待办」 */
                dashed: 'border-dashed border-line text-subtle',
                solid: 'border-inverse bg-inverse text-inverse-ink',
            },
        },
        defaultVariants: { variant: 'default' },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLSpanElement>,
        VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps): React.JSX.Element {
    return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
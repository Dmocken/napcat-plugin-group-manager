import { Slot } from '@radix-ui/react-slot';
import { LoaderCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/* 纯黑白体系：
   default = 描边（次要操作） / primary = 反色填充（全页唯一的强调按钮） /
   danger = 反色填充 + 加粗边框（仅用于确认弹窗，与页面上的 primary 不会同屏） */
export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost' | 'underline';
export type ButtonSize = 'default' | 'sm' | 'xs' | 'icon' | 'iconSm';

const BASE =
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border text-sm font-medium transition-[background-color,border-color,color,opacity] select-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-line-strong disabled:pointer-events-none disabled:opacity-40';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
    default: 'border-line bg-surface-2 text-ink hover:border-line-strong hover:bg-surface-3',
    primary: 'border-inverse bg-inverse text-inverse-ink hover:border-ink-2 hover:bg-ink-2',
    danger:
        'border-inverse bg-inverse text-inverse-ink ring-2 ring-inverse ring-offset-2 ring-offset-canvas hover:bg-ink-2',
    ghost: 'border-transparent bg-transparent text-muted hover:bg-surface-2 hover:text-ink',
    underline:
        'h-auto border-transparent bg-transparent p-0 text-xs text-subtle underline-offset-4 hover:text-ink hover:underline',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
    default: 'h-9 px-3.5',
    sm: 'h-8 px-3 text-[13px]',
    xs: 'h-7 px-2.5 text-xs',
    icon: 'size-9 p-0',
    iconSm: 'size-8 p-0',
};

export function buttonVariants({
    variant = 'default',
    size = 'default',
}: {
    variant?: ButtonVariant;
    size?: ButtonSize;
} = {}): string {
    return cn(BASE, VARIANT_CLASS[variant], SIZE_CLASS[size]);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    asChild?: boolean;
    /** 加载中：显示转圈并禁用交互 */
    loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, loading = false, type, children, ...props }, ref) => {
        const Comp = asChild ? Slot : 'button';
        return (
            <Comp
                ref={ref}
                type={asChild ? type : (type ?? 'button')}
                disabled={asChild ? undefined : loading || props.disabled}
                aria-busy={loading || undefined}
                className={cn(buttonVariants({ variant, size }), className)}
                {...props}
            >
                {loading ? (
                    <span className="flex items-center gap-1.5">
                        <LoaderCircle className="size-3.5 animate-spin" />
                        {children}
                    </span>
                ) : (
                    children
                )}
            </Comp>
        );
    },
);
Button.displayName = 'Button';
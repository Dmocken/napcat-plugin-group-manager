import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '@/lib/utils';

export const Switch = React.forwardRef<
    React.ComponentRef<typeof SwitchPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
        ref={ref}
        className={cn(
            // 视觉尺寸 36×20，额外扩大透明命中区到 44px 左右
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-line bg-surface-3 p-0 transition-colors',
            'after:absolute after:-inset-1.5 after:content-[""]',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-line-strong',
            'data-[state=checked]:border-inverse data-[state=checked]:bg-inverse',
            'disabled:cursor-not-allowed disabled:opacity-40',
            className,
        )}
        {...props}
    >
        <SwitchPrimitive.Thumb
            className={cn(
                'pointer-events-none block size-3.5 rounded-full bg-ink-2 transition-transform',
                'data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-inverse-ink',
                'data-[state=unchecked]:translate-x-[2px]',
            )}
        />
    </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

interface SwitchFieldProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label?: React.ReactNode;
    /** 标签下方的补充说明 */
    description?: React.ReactNode;
    className?: string;
    disabled?: boolean;
}

/** 开关 + 标签（可选说明）的一行；整行可点，热区足够 */
export function SwitchField({
    checked,
    onCheckedChange,
    label,
    description,
    className,
    disabled,
}: SwitchFieldProps): React.JSX.Element {
    return (
        <label
            className={cn(
                'inline-flex select-none items-center gap-2.5',
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
                className,
            )}
        >
            <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
            {label || description ? (
                <span className="flex flex-col leading-tight">
                    {label ? <span className="text-[13px] text-ink-2">{label}</span> : null}
                    {description ? (
                        <span className="mt-0.5 text-xs text-subtle">{description}</span>
                    ) : null}
                </span>
            ) : null}
        </label>
    );
}
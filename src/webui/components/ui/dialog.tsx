import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const DialogOverlay = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Overlay>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
        ref={ref}
        className={cn('gm-overlay fixed inset-0 z-[100] bg-black/70', className)}
        {...props}
    />
));
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Content>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { hideClose?: boolean }
>(({ className, children, hideClose = false, ...props }, ref) => (
    <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
            ref={ref}
            className={cn(
                'gm-content fixed top-1/2 left-1/2 z-[101] w-[92%] max-w-[460px] -translate-x-1/2 -translate-y-1/2',
                'rounded-card border border-line-strong bg-surface shadow-modal focus:outline-none',
                className,
            )}
            {...props}
        >
            <div className="relative">
                {hideClose ? null : (
                    <DialogPrimitive.Close asChild>
                        <button
                            type="button"
                            aria-label="关闭"
                            className="absolute top-3.5 right-3.5 grid size-7 cursor-pointer place-items-center rounded-full text-subtle transition-colors hover:bg-surface-3 hover:text-ink"
                        >
                            <X className="size-3.5" />
                        </button>
                    </DialogPrimitive.Close>
                )}
                {children}
            </div>
        </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export const DialogTitle = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Title>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Title
        ref={ref}
        className={cn('text-[15px] leading-6 font-semibold text-ink', className)}
        {...props}
    />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
    React.ComponentRef<typeof DialogPrimitive.Description>,
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
    <DialogPrimitive.Description
        ref={ref}
        className={cn('text-[13px] leading-relaxed text-muted', className)}
        {...props}
    />
));
DialogDescription.displayName = 'DialogDescription';

/** 标题区：tone = danger 时标题左侧出现警示图标（黑白体系下用图标而非红色表达危险） */
function DialogHeading({
    title,
    tone,
    children,
}: {
    title: string;
    tone?: 'default' | 'danger';
    children?: React.ReactNode;
}): React.JSX.Element {
    const Icon = tone === 'danger' ? DangerMark : undefined;
    return (
        <div className="flex items-start gap-2.5">
            {Icon ? <Icon className="mt-1 size-4 shrink-0" /> : null}
            <div className="min-w-0 flex-1">
                <h2 className="text-[15px] leading-6 font-semibold text-ink">{title}</h2>
                {children ? (
                    <div className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line text-muted">
                        {children}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

/** 危险提示标记：实心三角 + 感叹号（自绘，避免额外依赖） */
function DangerMark({ className }: { className?: string }): React.JSX.Element {
    return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
            <path d="M8 1 15 14H1L8 1Zm0 4.6a.8.8 0 0 0-.8.86l.25 3.1a.55.55 0 0 0 1.1 0l.25-3.1A.8.8 0 0 0 8 5.6Zm0 5.4a.85.85 0 1 0 0 1.7.85.85 0 0 0 0-1.7Z" />
        </svg>
    );
}

interface ConfirmDialogShellProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: React.ReactNode;
    tone?: 'default' | 'danger';
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    children?: React.ReactNode;
}

/** 确认弹窗统一外壳：标题 + 说明 + 底部操作（取消在左、确认在右） */
export function ConfirmDialogShell({
    open,
    onOpenChange,
    title,
    description,
    tone = 'default',
    confirmText = '确定',
    cancelText = '取消',
    onConfirm,
    children,
}: ConfirmDialogShellProps): React.JSX.Element {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <div className="p-5">
                    <DialogHeading title={title} tone={tone}>
                        {description}
                    </DialogHeading>
                    {children ? <div className="mt-4">{children}</div> : null}
                    <div className="mt-6 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="h-8 cursor-pointer rounded-control border border-line px-3 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-ink"
                        >
                            {cancelText}
                        </button>
                        <button
                            type="button"
                            onClick={onConfirm}
                            className={cn(
                                'h-8 cursor-pointer rounded-control border px-3.5 text-[13px] font-medium transition-colors',
                                // 危险操作用反色填充 + 加粗描边，普通确认只描边，避免页面出现两个强调按钮
                                tone === 'danger'
                                    ? 'border-inverse bg-inverse text-inverse-ink ring-2 ring-inverse ring-offset-2 ring-offset-surface hover:bg-ink-2'
                                    : 'border-inverse bg-inverse text-inverse-ink hover:bg-ink-2',
                            )}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export { DialogContent };
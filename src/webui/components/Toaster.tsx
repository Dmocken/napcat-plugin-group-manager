import { CircleCheck, TriangleAlert, X } from 'lucide-react';

import { useStore } from '@/store';

/** 轻量提示：亮边框块在暗底上足够显眼，语义由图标承担而非颜色 */
export function Toaster(): React.JSX.Element {
    const toasts = useStore((s) => s.toasts);
    const dismiss = useStore((s) => s.dismissToast);

    return (
        <div
            aria-live="polite"
            className="pointer-events-none fixed top-4 left-1/2 z-[99] flex -translate-x-1/2 flex-col items-center gap-2"
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    className="gm-toast pointer-events-auto flex items-start gap-2 rounded-control border border-line-strong bg-surface-3 py-2 pr-1.5 pl-3 text-[13px] text-ink shadow-pop"
                >
                    {toast.kind === 'err' ? (
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    ) : (
                        <CircleCheck className="mt-0.5 size-3.5 shrink-0" />
                    )}
                    <span className="max-w-[420px] leading-relaxed">{toast.message}</span>
                    <button
                        type="button"
                        aria-label="关闭提示"
                        onClick={() => dismiss(toast.id)}
                        className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full text-subtle transition-colors hover:bg-line hover:text-ink"
                    >
                        <X className="size-3" />
                    </button>
                </div>
            ))}
        </div>
    );
}

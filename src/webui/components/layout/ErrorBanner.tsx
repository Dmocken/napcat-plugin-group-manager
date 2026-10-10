import { TriangleAlert, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useStore } from '@/store';

/** 顶部内联错误条：保存 / 加载失败时常驻，不依赖会自动消失的 toast */
export function ErrorBanner(): React.JSX.Element | null {
    const message = useStore((s) => s.errorBanner);
    const clearError = useStore((s) => s.clearError);
    const load = useStore((s) => s.load);
    const save = useStore((s) => s.save);
    const dirty = useStore((s) => s.dirty);

    if (!message) return null;

    return (
        <div className="flex items-center gap-3 border-b border-line-strong bg-surface-2 px-8 py-2.5">
            <TriangleAlert className="size-4 shrink-0 text-ink" />
            <p className="min-w-0 flex-1 truncate text-[13px] text-ink" title={message}>
                {message}
            </p>
            <Button size="xs" onClick={() => void (dirty ? save() : load())}>
                重试
            </Button>
            <button
                type="button"
                aria-label="关闭提示"
                onClick={clearError}
                className="grid size-6 cursor-pointer place-items-center rounded-full text-subtle transition-colors hover:bg-surface-3 hover:text-ink"
            >
                <X className="size-3.5" />
            </button>
        </div>
    );
}
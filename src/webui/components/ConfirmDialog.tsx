import { ConfirmDialogShell } from '@/components/ui/dialog';
import { useStore } from '@/store';

/** 全局确认弹窗：删除配置、覆盖导入等操作共用 */
export function ConfirmDialog(): React.JSX.Element {
    const confirmState = useStore((s) => s.confirmState);
    const resolveConfirm = useStore((s) => s.resolveConfirm);

    const close = (open: boolean): void => {
        if (!open) resolveConfirm(false);
    };

    return (
        <ConfirmDialogShell
            open={Boolean(confirmState)}
            onOpenChange={close}
            title={confirmState?.title ?? '确认'}
            description={confirmState?.text ?? ''}
            tone={confirmState?.tone ?? 'default'}
            confirmText={confirmState?.tone === 'danger' ? '确认执行' : '确定'}
            onConfirm={() => resolveConfirm(true)}
        />
    );
}

import { CircleCheck, RefreshCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { featureIcon, featureShort } from '@/lib/constants';
import type { ErrorRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/** 一行摘要：时间 + 来源 + 群/用户 + 错误信息 */
function Row({ record, compact = false }: { record: ErrorRecord; compact?: boolean }): React.JSX.Element {
    const Icon = record.feature ? featureIcon(record.feature) : TriangleAlert;
    const label = record.feature ? featureShort(record.feature, record.feature) : record.source;

    return (
        <div
            className={cn(
                'flex items-start gap-3 border-b border-line/70 px-5 py-2 last:border-b-0',
                compact && 'py-2.5',
            )}
        >
            <Icon className="mt-0.5 size-3.5 shrink-0 text-subtle" />
            <span className="w-[132px] shrink-0 font-mono-num text-[11px] text-subtle">
                {record.time.slice(5)}
            </span>
            <span className="w-[92px] shrink-0 truncate text-[12px] text-ink-2">{label}</span>
            <span className="w-[112px] shrink-0 truncate font-mono-num text-[11px] text-subtle">
                {record.groupId ? `群 ${record.groupId}` : record.source}
                {record.userId ? ` · ${record.userId}` : ''}
            </span>
            <span
                className={cn(
                    'min-w-0 flex-1 text-[12px] text-muted',
                    compact ? 'line-clamp-1' : 'break-all',
                )}
            >
                {record.message}
            </span>
        </div>
    );
}

/** 概览页底部：最近 5 条错误 + 查看全部（弹窗看完整列表） */
export function ErrorLogPanel(): React.JSX.Element {
    const errors = useStore((s) => s.errors);
    const bootAt = useStore((s) => s.errorsBootAt);
    const refreshErrors = useStore((s) => s.refreshErrors);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const recent = errors.slice(0, 5);
    /** 本次启动产生的条数：与顶部「异常次数」口径一致 */
    const inThisRun = bootAt ? errors.filter((r) => r.boot === bootAt).length : errors.length;
    const historyCount = errors.length - inThisRun;

    const reload = async (): Promise<void> => {
        setLoading(true);
        await refreshErrors();
        setLoading(false);
    };

    return (
        <>
            <Panel>
                <PanelHeader
                    title="最近异常"
                    description={`来自 data/errors.log，跨重启保留最近 50 条；本次启动 ${inThisRun} 条` + (historyCount > 0 ? `，历史 ${historyCount} 条` : '')}
                    actions={
                        <div className="flex items-center gap-2">
                            <Button size="sm" loading={loading} onClick={() => void reload()}>
                                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                                刷新
                            </Button>
                            <Button size="sm" onClick={() => setOpen(true)} disabled={!errors.length}>
                                查看全部
                            </Button>
                        </div>
                    }
                />

                {errors.length === 0 ? (
                    <div className="flex items-center gap-2 px-5 py-6 text-[13px] text-subtle">
                        <CircleCheck className="size-4" />
                        暂无异常记录
                    </div>
                ) : (
                    <>
                        {recent.map((record, index) => (
                            <Row key={`${record.time}-${index}`} record={record} />
                        ))}
                        {errors.length > 5 ? (
                            <div className="border-t border-line px-5 py-2 text-[11px] text-subtle">
                                另有 {errors.length - 5} 条更早的记录
                            </div>
                        ) : null}
                    </>
                )}
            </Panel>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[860px]" hideClose>
                    <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                            <DialogTitle>异常记录</DialogTitle>
                            <DialogDescription className="mt-1">
                                共 {errors.length} 条（本次启动 {inThisRun} 条、历史 {historyCount} 条），
                                最多保留 50 条，超出后自动轮转 errors.log
                            </DialogDescription>
                        </div>
                        <Button size="sm" loading={loading} onClick={() => void reload()}>
                            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                            刷新
                        </Button>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto">
                        {errors.length === 0 ? (
                            <p className="px-5 py-8 text-center text-[13px] text-subtle">
                                暂无异常记录
                            </p>
                        ) : (
                            errors.map((record, index) => (
                                <Row key={`${record.time}-${index}`} record={record} />
                            ))
                        )}
                    </div>

                    <div className="flex items-center justify-end border-t border-line px-5 py-3">
                        <Button onClick={() => setOpen(false)}>关闭</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
import { CircleCheck, Copy, Download, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { Hint } from '@/components/ui/hint';
import { IdentityCell } from '@/components/ui/identity';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { featureIcon, featureShort } from '@/lib/constants';
import type { ErrorRecord } from '@/lib/types';
import { cn, copyText, selectForManualCopy } from '@/lib/utils';
import { useStore } from '@/store';

/** 复制用的完整文本：把界面省略掉的部分补全 */
function recordText(record: ErrorRecord, groupName: string): string {
    const who = record.userName ? `${record.userName}(${record.userId})` : record.userId;
    const group =
        groupName && groupName !== record.groupId
            ? `${groupName}(${record.groupId})`
            : record.groupId;

    return [
        `时间：${record.time}`,
        `来源：${record.source}${record.command ? ` / ${record.command}` : ''}`,
        `功能：${record.feature || '—'}`,
        `群：${group || '—'}`,
        `用户：${who || '—'}`,
        `报错：${record.message}`,
    ].join('\n');
}

/** 一行摘要：时间 + 功能 + 群 / 用户 + 单行报错（悬浮看全文、右侧可复制整条） */
function Row({
    record,
    nameOf,
    onCopy,
    portalHint = false,
}: {
    record: ErrorRecord;
    nameOf: (groupId: string) => string;
    onCopy: (record: ErrorRecord) => void;
    /** 在弹窗的滚动区里必须开启，否则浮窗会被容器裁切 */
    portalHint?: boolean;
}): React.JSX.Element {
    const Icon = record.feature ? featureIcon(record.feature) : TriangleAlert;
    const label = record.feature ? featureShort(record.feature, record.feature) : record.source;

    return (
        <div className="flex items-center gap-3 border-b border-line/70 px-5 py-2.5 last:border-b-0">
            <span className="w-[118px] shrink-0 font-mono-num text-[11px] text-subtle">
                {record.time.slice(5)}
            </span>

            {/* 功能 + 触发它的命令（事件类 / 系统类记录没有命令名） */}
            <span className="flex w-[148px] shrink-0 items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-subtle" />
                <span className="truncate text-[12px] text-ink-2">{label}</span>
                {record.command ? (
                    <span className="max-w-[72px] shrink-0 truncate rounded border border-line px-1 font-mono-num text-[10px] text-subtle">
                        {record.command}
                    </span>
                ) : null}
            </span>

            <IdentityCell
                kind="group"
                id={record.groupId}
                name={record.groupId ? nameOf(record.groupId) : ''}
                className="w-[168px] shrink-0"
            />
            <IdentityCell
                kind="user"
                id={record.userId}
                name={record.userName}
                className="w-[150px] shrink-0"
            />

            <Hint
                className="flex min-w-0 flex-1"
                width={420}
                portal={portalHint}
                content={<span className="break-all">{record.message}</span>}
            >
                <span className="min-w-0 flex-1 cursor-default truncate text-[12px] text-muted">
                    {record.message}
                </span>
            </Hint>

            <Button
                variant="ghost"
                size="iconSm"
                className="size-7 shrink-0"
                title="复制整条日志"
                aria-label="复制整条日志"
                onClick={() => onCopy(record)}
            >
                <Copy className="size-3.5" />
            </Button>
        </div>
    );
}

/** 概览页底部：最近 5 条错误 + 查看全部（弹窗看完整列表） */
export function ErrorLogPanel(): React.JSX.Element {
    const errors = useStore((s) => s.errors);
    const bootAt = useStore((s) => s.errorsBootAt);
    const groups = useStore((s) => s.groups);
    const refreshErrors = useStore((s) => s.refreshErrors);
    const downloadLog = useStore((s) => s.downloadLog);
    const clearLog = useStore((s) => s.clearLog);
    const toast = useStore((s) => s.toast);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const nameOf = (groupId: string): string =>
        groups.find((g) => String(g.group_id) === groupId)?.group_name || groupId;

    const copy = async (record: ErrorRecord): Promise<void> => {
        const text = recordText(record, nameOf(record.groupId));
        if (await copyText(text)) {
            toast('已复制异常详情');
            return;
        }
        // 浏览器不允许自动复制时，退化成「内容已选中，按 Ctrl/⌘ + C」
        if (selectForManualCopy(text)) {
            toast('浏览器不允许自动复制，内容已选中，请按 Ctrl/⌘ + C', 'err');
            return;
        }
        toast('复制失败，请手动选中内容后复制', 'err');
    };

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
                            <Row
                                key={`${record.time}-${index}`}
                                record={record}
                                nameOf={nameOf}
                                onCopy={(item) => void copy(item)}
                            />
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
                <DialogContent className="max-w-[1120px]" hideClose>
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
                                <Row
                                    key={`${record.time}-${index}`}
                                    record={record}
                                    nameOf={nameOf}
                                    onCopy={(item) => void copy(item)}
                                    portalHint
                                />
                            ))
                        )}
                    </div>

                    <div className="flex items-center gap-2 border-t border-line px-5 py-3">
                        <Button
                            size="sm"
                            disabled={!errors.length}
                            onClick={() => void downloadLog('errors')}
                        >
                            <Download className="size-3.5" />
                            下载日志
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={!errors.length}
                            title="清空 data/errors.log，并把本次运行的异常次数归零"
                            onClick={() => void clearLog('errors')}
                        >
                            <Trash2 className="size-3.5" />
                            清空
                        </Button>
                        <span className="flex-1" />
                        <Button onClick={() => setOpen(false)}>关闭</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

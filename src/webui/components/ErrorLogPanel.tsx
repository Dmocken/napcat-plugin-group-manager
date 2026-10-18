import { BarChart3, CircleCheck, Copy, Download, List, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { TimeSeriesChart, buildTimeSeries } from '@/components/charts/TimeSeriesChart';
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
import {
    ERROR_GROUP_CHILDREN,
    errorGroup,
    LOG_GROUP_ORDER,
    type LogGroup,
} from '@/lib/log-groups';
import type { ErrorRecord } from '@/lib/types';
import { cn, copyText, selectForManualCopy } from '@/lib/utils';
import { useStore } from '@/store';

/** 弹窗分页：每页条数 */
const PAGE_SIZE = 10;

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
    const [page, setPage] = useState(0);
    const [view, setView] = useState<'chart' | 'list'>('chart');
    const [dialogView, setDialogView] = useState<'chart' | 'list'>('chart');
    /** 已拆开显示的子项：业务组 → feature 集合 */
    const [split, setSplit] = useState<Record<string, Set<string>>>({});

    const toggleSplit = (group: string, child: string): void => {
        setSplit((prev) => {
            const next = { ...prev, [group]: new Set(prev[group] ?? []) };
            if (next[group].has(child)) next[group].delete(child);
            else next[group].add(child);
            if (!next[group].size) delete next[group];
            return next;
        });
    };
    const setSplitGroup = (group: string, children: string[]): void => {
        setSplit((prev) => {
            const next = { ...prev };
            if (children.length) next[group] = new Set(children);
            else delete next[group];
            return next;
        });
    };

    /** 一段时间内各业务组的异常次数（按小时 / 天分桶） */
    const errorSeries = useMemo(
        () =>
            buildTimeSeries(
                errors,
                (r) => r.time,
                (r) => {
                    const base = errorGroup(r.feature, r.command);
                    const sub = r.feature || r.command || '';
                    const children = ERROR_GROUP_CHILDREN[base as LogGroup];
                    return children?.includes(sub) && split[base]?.has(sub)
                        ? base + ' · ' + sub
                        : base;
                },
                LOG_GROUP_ORDER.filter((group) => split[group]?.size),
                24,
            ),
        [errors, split],
    );

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

    /** 弹窗分页：当前页（数据变化时夹紧，避免停留在已不存在的页） */
    const total = errors.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const pageList = errors.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

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
                    description={`来自 data/errors.log，跨重启保留最近 200 条；本次启动 ${inThisRun} 条` + (historyCount > 0 ? `，历史 ${historyCount} 条` : '')}
                    actions={
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant={view === 'chart' ? 'default' : 'ghost'}
                                onClick={() => setView('chart')}
                            >
                                <BarChart3 className="size-3.5" />
                                图表
                            </Button>
                            <Button
                                size="sm"
                                variant={view === 'list' ? 'default' : 'ghost'}
                                onClick={() => setView('list')}
                            >
                                <List className="size-3.5" />
                                日志
                            </Button>
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

                {view === 'chart' ? (
                    <TimeSeriesChart
                        data={errorSeries}
                        groupChildren={ERROR_GROUP_CHILDREN}
                        split={split}
                        onToggleSplit={toggleSplit}
                        onSetSplit={setSplitGroup}
                    />
                ) : errors.length === 0 ? (
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

            <Dialog open={open} onOpenChange={(v) => { if (v) setPage(0); setOpen(v); }}>
                <DialogContent className="max-w-[1120px]" hideClose>
                    <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                            <DialogTitle>异常记录</DialogTitle>
                            <DialogDescription className="mt-1">
                                共 {errors.length} 条（本次启动 {inThisRun} 条、历史 {historyCount} 条），
                                最多保留 200 条，超出后自动轮转 errors.log
                            </DialogDescription>
                        </div>
                        <Button
                            size="sm"
                            variant={dialogView === 'chart' ? 'default' : 'ghost'}
                            onClick={() => setDialogView('chart')}
                        >
                            <BarChart3 className="size-3.5" />
                            图表
                        </Button>
                        <Button
                            size="sm"
                            variant={dialogView === 'list' ? 'default' : 'ghost'}
                            onClick={() => setDialogView('list')}
                        >
                            <List className="size-3.5" />
                            日志
                        </Button>
                        <Button size="sm" loading={loading} onClick={() => void reload()}>
                            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                            刷新
                        </Button>
                    </div>

                    {dialogView === 'chart' ? (
                        <TimeSeriesChart
                            data={errorSeries}
                            groupChildren={ERROR_GROUP_CHILDREN}
                            split={split}
                            onToggleSplit={toggleSplit}
                            onSetSplit={setSplitGroup}
                        />
                    ) : (
                        <>
                            <div className="max-h-[420px] overflow-y-auto">
                                {errors.length === 0 ? (
                                    <p className="px-5 py-8 text-center text-[13px] text-subtle">
                                        暂无异常记录
                                    </p>
                                ) : (
                                    pageList.map((record, index) => (
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

                            {total > PAGE_SIZE ? (
                                <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-2 text-[11px]">
                                    <span className="text-subtle">
                                        第 {safePage + 1} / {totalPages} 页 · 共 {total} 条
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={safePage === 0}
                                            onClick={() => setPage((p) => Math.max(0, p - 1))}
                                        >
                                            上一页
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={safePage >= totalPages - 1}
                                            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                        >
                                            下一页
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </>
                    )}

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

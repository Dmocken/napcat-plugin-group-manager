import { Activity, CircleCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { IdentityCell } from '@/components/ui/identity';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { featureIcon, featureShort } from '@/lib/constants';
import type { ActivityRecord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

const SOURCE_TEXT: Record<string, string> = {
    command: '命令',
    event: '事件',
    api: '接口',
};

const RESULT_TEXT: Record<string, string> = {
    ok: '成功',
    fail: '失败',
    reject: '已拒绝',
};

const RESULT_VARIANT: Record<string, 'default' | 'strong' | 'dashed'> = {
    ok: 'default',
    fail: 'strong',
    reject: 'dashed',
};

/** 一行调用记录：时间 / 功能 / 群与用户 / 触发与回复 / 结果 */
function Row({
    record,
    nameOf,
}: {
    record: ActivityRecord;
    nameOf: (groupId: string) => string;
}): React.JSX.Element {
    const isFeature = Boolean(record.feature) && record.feature !== 'system';
    const Icon = isFeature ? featureIcon(record.feature) : Activity;
    const label = isFeature
        ? featureShort(record.feature, record.feature)
        : (SOURCE_TEXT[record.source] ?? record.source);

    const lines: [string, string][] = [
        [record.action, record.input || '—'],
        ['发送', record.sent || '—'],
    ];
    if (record.note) lines.push(['说明', record.note]);

    return (
        <div className="flex items-center gap-3 border-b border-line/70 px-5 py-2.5 last:border-b-0">
            <span className="w-[118px] shrink-0 font-mono-num text-[11px] text-subtle">
                {record.time.slice(5)}
            </span>
            <span className="flex w-[92px] shrink-0 items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-subtle" />
                <span className="truncate text-[12px] text-ink-2">{label}</span>
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
            <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-[12px]">
                {lines.map(([key, value], index) => (
                    <div key={key} className="flex min-w-0 items-baseline gap-2">
                        <span
                            className={cn(
                                'w-[52px] shrink-0 truncate text-[10px] text-subtle',
                                index === 0 && 'font-mono-num',
                            )}
                            title={key}
                        >
                            {key}
                        </span>
                        <span
                            className={cn(
                                'min-w-0 flex-1 truncate',
                                index === 0 ? 'text-muted' : 'text-ink-2',
                            )}
                            title={value}
                        >
                            {value}
                        </span>
                    </div>
                ))}
            </div>
            <Badge variant={RESULT_VARIANT[record.result] ?? 'default'}>
                {RESULT_TEXT[record.result] ?? record.result}
            </Badge>
        </div>
    );
}

/** 概览页：最近 5 条功能调用 + 查看全部（弹窗看完整列表） */
export function ActivityLogPanel(): React.JSX.Element {
    const activities = useStore((s) => s.activities);
    const bootAt = useStore((s) => s.activitiesBootAt);
    const groups = useStore((s) => s.groups);
    const refreshActivities = useStore((s) => s.refreshActivities);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const nameOf = (groupId: string): string =>
        groups.find((g) => String(g.group_id) === groupId)?.group_name || groupId;

    const recent = activities.slice(0, 5);
    /** 本次启动产生的条数：与错误日志口径一致 */
    const inThisRun = bootAt ? activities.filter((r) => r.boot === bootAt).length : activities.length;
    const historyCount = activities.length - inThisRun;
    const abnormal = activities.filter((r) => r.result !== 'ok').length;

    const reload = async (): Promise<void> => {
        setLoading(true);
        await refreshActivities();
        setLoading(false);
    };

    return (
        <>
            <Panel>
                <PanelHeader
                    title="功能调用日志"
                    description={
                        `来自 data/activity.log，跨重启保留最近 50 条；本次启动 ${inThisRun} 条` +
                        (historyCount > 0 ? `，历史 ${historyCount} 条` : '') +
                        (abnormal > 0 ? `，其中失败 / 拒绝 ${abnormal} 条` : '')
                    }
                    actions={
                        <div className="flex items-center gap-2">
                            <Button size="sm" loading={loading} onClick={() => void reload()}>
                                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                                刷新
                            </Button>
                            <Button size="sm" onClick={() => setOpen(true)} disabled={!activities.length}>
                                查看全部
                            </Button>
                        </div>
                    }
                />

                {activities.length === 0 ? (
                    <div className="flex items-center gap-2 px-5 py-6 text-[13px] text-subtle">
                        <CircleCheck className="size-4" />
                        暂无功能调用记录
                    </div>
                ) : (
                    <>
                        {recent.map((record, index) => (
                            <Row key={`${record.time}-${index}`} record={record} nameOf={nameOf} />
                        ))}
                        {activities.length > 5 ? (
                            <div className="border-t border-line px-5 py-2 text-[11px] text-subtle">
                                另有 {activities.length - 5} 条更早的记录
                            </div>
                        ) : null}
                    </>
                )}
            </Panel>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-[1200px]" hideClose>
                    <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                        <div className="min-w-0 flex-1">
                            <DialogTitle>功能调用日志</DialogTitle>
                            <DialogDescription className="mt-1">
                                共 {activities.length} 条（本次启动 {inThisRun} 条、历史 {historyCount} 条），
                                最多保留 50 条，超出后自动轮转 activity.log
                            </DialogDescription>
                        </div>
                        <Button size="sm" loading={loading} onClick={() => void reload()}>
                            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                            刷新
                        </Button>
                    </div>

                    <div className="max-h-[460px] overflow-y-auto">
                        {activities.length === 0 ? (
                            <p className="px-5 py-8 text-center text-[13px] text-subtle">
                                暂无功能调用记录
                            </p>
                        ) : (
                            activities.map((record, index) => (
                                <Row key={`${record.time}-${index}`} record={record} nameOf={nameOf} />
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

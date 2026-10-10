import { Check, Copy, Search, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { ErrorLogPanel } from '@/components/ErrorLogPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/hint';
import { Input } from '@/components/ui/input';
import { EmptyState, Panel, PanelHeader } from '@/components/ui/panel';
import { SwitchField } from '@/components/ui/switch';
import { featureIcon, featureShort } from '@/lib/constants';
import type { GroupProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/* ---------------- 指标卡 ---------------- */

function MetricCard({
    label,
    value,
    hint,
    emphasis = false,
}: {
    label: string;
    value: React.ReactNode;
    hint?: string;
    /** 有异常时用反色块强调（黑白体系里唯一的「警示」表达） */
    emphasis?: boolean;
}): React.JSX.Element {
    return (
        <div
            className={cn(
                'rounded-panel border px-4 py-3.5',
                emphasis ? 'border-inverse bg-inverse text-inverse-ink' : 'border-line bg-surface',
            )}
        >
            <div
                className={cn(
                    'font-mono-num text-[26px] leading-8 font-semibold tracking-tight',
                    emphasis ? 'text-inverse-ink' : 'text-ink',
                )}
            >
                {value}
            </div>
            <div
                className={cn(
                    'mt-1 text-[13px]',
                    emphasis ? 'text-inverse-ink/70' : 'text-ink-2',
                )}
            >
                {label}
            </div>
            {hint ? (
                <div
                    className={cn(
                        'mt-0.5 text-[11px]',
                        emphasis ? 'text-inverse-ink/60' : 'text-subtle',
                    )}
                >
                    {hint}
                </div>
            ) : null}
        </div>
    );
}

/* ---------------- 功能矩阵 ---------------- */

/** 行 = 群，列 = 功能；单元格直接切换该群所在配置里的功能开关 */
function FeatureMatrix(): React.JSX.Element {
    const meta = useStore((s) => s.meta);
    const groups = useStore((s) => s.groups);
    const profiles = useStore((s) => s.profiles);
    const toggleGroupFeature = useStore((s) => s.toggleGroupFeature);

    const [keyword, setKeyword] = useState('');
    const [onlyEnabled, setOnlyEnabled] = useState(false);

    const features = meta?.features ?? [];

    /** 归属以本地配置为准（编辑期间服务端快照是旧的） */
    const owners = useMemo(() => {
        const map: Record<string, GroupProfile> = {};
        profiles.forEach((profile) => {
            profile.group_ids.forEach((gid) => {
                map[String(gid)] = profile;
            });
        });
        return map;
    }, [profiles]);

    const rows = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        return groups.filter((group) => {
            const owner = owners[String(group.group_id)];
            const enabled = owner
                ? Object.values(owner.features).filter((f) => f.enabled).length
                : 0;
            if (onlyEnabled && enabled === 0) return false;
            if (!kw) return true;
            return (
                String(group.group_id).includes(kw) ||
                (group.group_name || '').toLowerCase().includes(kw)
            );
        });
    }, [groups, owners, keyword, onlyEnabled]);

    const enabledCells = useMemo(() => {
        let count = 0;
        groups.forEach((group) => {
            const owner = owners[String(group.group_id)];
            if (!owner) return;
            Object.values(owner.features).forEach((f) => {
                if (f.enabled) count += 1;
            });
        });
        return count;
    }, [groups, owners]);

    if (!groups.length) {
        return (
            <EmptyState
                icon={<Search className="size-6" />}
                title="还没有拉到群列表"
                description="插件需要收到一次群消息后才能获取群列表。可在「群配置 → 绑定群」里手动输入群号完成绑定。"
            />
        );
    }

    return (
        <div className="rounded-panel border border-line bg-surface">
            <PanelHeader
                title="功能矩阵"
                description="每列是一个功能，每格点击即可切换。一个群只能属于一条配置，因此开关会同步到该配置下的所有群。"
                actions={
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
                            <Input
                                value={keyword}
                                onChange={(event) => setKeyword(event.target.value)}
                                placeholder="搜索群号 / 群名"
                                className="h-8 w-[200px] pl-8"
                            />
                        </div>
                        <SwitchField
                            checked={onlyEnabled}
                            onCheckedChange={setOnlyEnabled}
                            label="只看有启用功能的群"
                        />
                    </div>
                }
            />

            <div className="max-h-[520px] overflow-auto">
                <table className="w-full border-collapse text-[13px]">
                    <thead className="sticky top-0 z-10">
                        <tr className="border-b border-line">
                            <th
                                scope="col"
                                className="sticky left-0 z-20 w-[212px] min-w-[212px] bg-surface py-2.5 pr-3 pl-5 text-left text-[11px] font-medium text-subtle"
                            >
                                群 / 配置
                            </th>
                            {features.map((feature) => {
                                const Icon = featureIcon(feature.key);
                                return (
                                    <th
                                        key={feature.key}
                                        scope="col"
                                        className="bg-surface px-1 py-2.5 text-center font-medium text-subtle"
                                    >
                                        <Hint content={`${feature.label}\n${feature.usage}`} width={340}>
                                            <span className="flex cursor-help flex-col items-center gap-1 px-2 py-0.5 text-[11px]">
                                                <Icon className="size-4" />
                                                {featureShort(feature.key, feature.label)}
                                            </span>
                                        </Hint>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((group) => {
                            const gid = String(group.group_id);
                            const owner = owners[gid];
                            return (
                                <tr
                                    key={gid}
                                    className="border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/60"
                                >
                                    <th
                                        scope="row"
                                        className="sticky left-0 z-10 w-[212px] min-w-[212px] bg-surface py-2 pr-3 pl-5 text-left font-normal"
                                    >
                                        <div className="flex items-baseline gap-1.5">
                                            <span className="truncate text-[13px] text-ink-2">
                                                {group.group_name || '未命名群'}
                                            </span>
                                            <span className="shrink-0 text-[11px] text-subtle">
                                                {owner ? owner.label : '未绑定'}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 flex items-center gap-1.5 font-mono-num text-[11px] text-subtle">
                                            <span>{gid}</span>
                                            <span className="font-sans">·</span>
                                            <span>{group.member_count} 人</span>
                                        </div>
                                    </th>
                                    {features.map((feature) => {
                                        const settings = owner?.features[feature.key];
                                        const on = settings?.enabled === true;
                                        return (
                                            <td key={feature.key} className="px-1 py-2 text-center">
                                                <button
                                                    type="button"
                                                    disabled={!settings}
                                                    onClick={() => toggleGroupFeature(gid, feature.key)}
                                                    title={
                                                        settings
                                                            ? `${group.group_name || gid} · ${feature.label}：${on ? '已启用' : '未启用'}（保存后生效）`
                                                            : '该群还没有绑定配置'
                                                    }
                                                    aria-pressed={on}
                                                    className={cn(
                                                        'mx-auto grid size-6 place-items-center rounded-[5px] border transition-colors',
                                                        settings
                                                            ? 'cursor-pointer hover:border-line-strong'
                                                            : 'cursor-not-allowed border-dashed border-line/60',
                                                        on
                                                            ? 'border-inverse bg-inverse text-inverse-ink'
                                                            : 'border-line bg-transparent',
                                                    )}
                                                >
                                                    {on ? <Check className="size-3.5" /> : null}
                                                </button>
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                        {!rows.length ? (
                            <tr>
                                <td
                                    colSpan={features.length + 1}
                                    className="px-5 py-10 text-center text-[13px] text-subtle"
                                >
                                    没有符合条件的群
                                </td>
                            </tr>
                        ) : null}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between border-t border-line px-5 py-2.5 text-[11px] text-subtle">
                <span>
                    显示 {rows.length} / {groups.length} 个群 · 共 {enabledCells} 项功能启用
                </span>
                <span>矩阵反映的是当前编辑中的配置，保存后生效</span>
            </div>
        </div>
    );
}

/* ---------------- 概览页 ---------------- */

export function OverviewPage(): React.JSX.Element {
    const status = useStore((s) => s.status);
    const profiles = useStore((s) => s.profiles);
    const groups = useStore((s) => s.groups);
    const global = useStore((s) => s.global);
    const lastSavedAt = useStore((s) => s.lastSavedAt);
    const toast = useStore((s) => s.toast);

    // 记录管理员最近一次访问本页的时间（纯前端，localStorage）
    const [visit, setVisit] = useState<{ now: string; prev: string }>({ now: '', prev: '' });
    useEffect(() => {
        const KEY = 'gm-last-visit';
        const fmt = (d: Date): string =>
            d.toLocaleString('zh-CN', {
                hour12: false,
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
            });
        let prev = '';
        try {
            prev = localStorage.getItem(KEY) ?? '';
        } catch {
            prev = '';
        }
        const now = new Date();
        try {
            localStorage.setItem(KEY, now.toISOString());
        } catch {
            /*隐私模式下忽略 */
        }
        setVisit({
            now: fmt(now),
            prev: prev ? fmt(new Date(prev)) : '',
        });
    }, []);

    const boundGroups = profiles.reduce((sum, item) => sum + item.group_ids.length, 0);
    const enabledFeatures = profiles.reduce(
        (sum, item) => sum + Object.values(item.features).filter((f) => f.enabled).length,
        0,
    );
    const errors = status?.stats.errors ?? 0;
    const admins = global.global_admins ?? [];

    const copyPath = async (): Promise<void> => {
        const path = status?.dataPath;
        if (!path) return;
        try {
            await navigator.clipboard.writeText(path);
            toast('数据目录已复制');
        } catch {
            toast('复制失败，请手动选中路径', 'err');
        }
    };

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-4 gap-3">
                <MetricCard
                    label="已绑定群"
                    value={boundGroups}
                    hint={`机器人可见 ${groups.length} 个群`}
                />
                <MetricCard label="群配置" value={profiles.length} hint="一条配置可绑定多个群" />
                <MetricCard
                    label="管理员"
                    value={admins.length}
                    hint={admins.length ? '拥有全部群全部功能' : '未设置，无人可强制操作'}
                />
                <MetricCard
                    label="异常次数"
                    value={status?.stats.errors ?? '—'}
                    hint={errors > 0 ? '本次启动累计，重启后清零' : '运行正常'}
                    emphasis={errors > 0}
                />
            </div>

            <FeatureMatrix />

            <div className="grid grid-cols-3 gap-3">
                <Panel className="p-5">
                    <h3 className="text-[13px] font-semibold text-ink">运行数据</h3>
                    <dl className="mt-3 space-y-2 text-[13px]">
                        {(
                            [
                                ['收到消息', status?.stats.messageReceived],
                                ['执行命令', status?.stats.commandHandled],
                                ['处理事件', status?.stats.eventHandled],
                                ['启用功能项', enabledFeatures],
                                ['异常次数', status?.stats.errors],
                            ] as [string, number | undefined][]
                        ).map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between">
                                <dt className="text-subtle">{label}</dt>
                                <dd className="font-mono-num text-ink-2">
                                    {value === undefined ? '—' : String(value)}
                                </dd>
                            </div>
                        ))}
                        <div className="flex items-center justify-between border-t border-line pt-2">
                            <dt className="text-subtle">运行时长</dt>
                            <dd className="text-ink-2">{status?.uptime ?? '—'}</dd>
                        </div>
                    </dl>
                </Panel>

                <Panel className="p-5">
                    <h3 className="text-[13px] font-semibold text-ink">插件信息</h3>
                    <dl className="mt-3 space-y-2 text-[13px]">
                        <div className="flex items-center justify-between">
                            <dt className="text-subtle">状态</dt>
                            <dd className="flex items-center gap-1.5 text-ink-2">
                                {global.enabled === false ? (
                                    <>
                                        <TriangleAlert className="size-3.5" />
                                        已停用
                                    </>
                                ) : (
                                    '运行中'
                                )}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-subtle">命令前缀</dt>
                            <dd className="font-mono-num text-ink-2">{global.command_prefix || '/'}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-subtle">Bot 管理员</dt>
                            <dd>
                                {admins.length ? (
                                    <Badge>{admins.length} 人</Badge>
                                ) : (
                                    <span className="text-subtle">未设置</span>
                                )}
                            </dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-subtle">最后保存</dt>
                            <dd className="text-ink-2">{lastSavedAt ?? '—'}</dd>
                        </div>
                        <div className="flex items-center justify-between">
                            <dt className="text-subtle">最近访问</dt>
                            <dd className="text-right">
                                <div className="font-mono-num text-ink-2">{visit.now || '—'}</div>
                                {visit.prev ? (
                                    <div className="text-[11px] text-subtle">上次 {visit.prev}</div>
                                ) : null}
                            </dd>
                        </div>
                    </dl>
                </Panel>

                <Panel className="p-5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-[13px] font-semibold text-ink">数据目录</h3>
                        <Button
                            variant="ghost"
                            size="iconSm"
                            title="复制路径"
                            aria-label="复制路径"
                            disabled={!status?.dataPath}
                            onClick={() => void copyPath()}
                        >
                            <Copy className="size-3.5" />
                        </Button>
                    </div>
                    <p className="mt-3 font-mono-num text-xs leading-relaxed break-all text-ink-2">
                        {status?.dataPath ?? '—'}
                    </p>
                    <p className="mt-3 text-[11px] leading-relaxed text-subtle">
                        备份与迁移直接操作该目录下的配置文件。
                    </p>
                </Panel>
            </div>

            <ErrorLogPanel />
        </div>
    );
}
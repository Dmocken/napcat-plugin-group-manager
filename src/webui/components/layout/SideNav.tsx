import { Layers, LayoutDashboard, Shield, SlidersHorizontal } from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/utils';
import { useStore, type PageKey } from '@/store';

const NAV: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: '概览', icon: LayoutDashboard },
    { key: 'global', label: '全局设置', icon: SlidersHorizontal },
    { key: 'profiles', label: '群配置', icon: Layers },
];

/** 系统时间：独立组件，避免整条侧栏每秒重渲染 */
function Clock(): React.JSX.Element {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);

    return (
        <dd className="font-mono-num text-muted">
            {now.toLocaleTimeString('zh-CN', { hour12: false })}
        </dd>
    );
}

/** 左侧主导航：固定宽度，页面切换只换右侧内容 */
export function SideNav(): React.JSX.Element {
    const page = useStore((s) => s.page);
    const setPage = useStore((s) => s.setPage);
    const status = useStore((s) => s.status);
    const global = useStore((s) => s.global);
    const profiles = useStore((s) => s.profiles);

    const enabled = global.enabled !== false;
    const bound = profiles.reduce((sum, item) => sum + item.group_ids.length, 0);

    return (
        <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-surface">
            <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
                <span className="grid size-7 place-items-center rounded-control border border-line bg-surface-2 text-ink">
                    <Shield className="size-4" />
                </span>
                <div className="min-w-0">
                    <div className="truncate text-[13px] leading-4 font-semibold text-ink">
                        {status?.pluginName ?? '群管助手'}
                    </div>
                    <div className="truncate text-[11px] leading-4 text-subtle">
                        {status ? `v${status.version}` : '加载中…'}
                    </div>
                </div>
            </div>

            <nav className="flex-1 p-3">
                <ul className="flex flex-col gap-1">
                    {NAV.map((item) => {
                        const active = page === item.key;
                        const Icon = item.icon;
                        return (
                            <li key={item.key}>
                                <button
                                    type="button"
                                    onClick={() => setPage(item.key)}
                                    aria-current={active ? 'page' : undefined}
                                    className={cn(
                                        'group relative flex w-full cursor-pointer items-center gap-2.5 rounded-control px-3 py-2 text-[13px] transition-colors',
                                        active
                                            ? 'bg-surface-3 text-ink'
                                            : 'text-muted hover:bg-surface-2 hover:text-ink-2',
                                    )}
                                >
                                    {active ? (
                                        <span className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-full bg-inverse" />
                                    ) : null}
                                    <Icon className="size-4 shrink-0" />
                                    {item.label}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            <div className="border-t border-line p-4">
                <dl className="space-y-1.5 text-[11px] text-subtle">
                    <div className="flex items-center justify-between">
                        <dt>插件</dt>
                        <dd className="flex items-center gap-1.5 text-muted">
                            <span
                                className={cn(
                                    'size-1.5 rounded-full',
                                    enabled ? 'bg-inverse' : 'border border-line-strong',
                                )}
                            />
                            {enabled ? '运行中' : '已停用'}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt>群 / 配置</dt>
                        <dd className="font-mono-num text-muted">
                            {bound} / {profiles.length}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt>已运行</dt>
                        <dd className="font-mono-num text-muted">{status?.uptime ?? '—'}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt>当前时间</dt>
                        <Clock />
                    </div>
                </dl>
            </div>
        </aside>
    );
}
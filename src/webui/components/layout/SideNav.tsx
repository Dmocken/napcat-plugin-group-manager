import {
    Database,
    Layers,
    LayoutDashboard,
    Send,
    Shield,
    SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { cn, formatUptime, useLiveUptime } from '@/lib/utils';
import { useStore, type PageKey } from '@/store';

const NAV: { key: PageKey; label: string; icon: typeof LayoutDashboard }[] = [
    { key: 'overview', label: '概览', icon: LayoutDashboard },
    { key: 'global', label: '全局设置', icon: SlidersHorizontal },
    { key: 'profiles', label: '群配置', icon: Layers },
    { key: 'data', label: '群数据', icon: Database },
    { key: 'broadcast', label: '发送消息', icon: Send },
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

/** GitHub 品牌标记：lucide 已移除品牌图标，这里内联官方 mark */
function GithubMark({ className }: { className?: string }): React.JSX.Element {
    return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className={className}>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
        </svg>
    );
}

/** 侧栏底部外链：仓库与作者主页；icon 缺省时用内联 GitHub 标记 */
const LINKS: { href: string; label: string; title: string; icon?: string }[] = [
    {
        href: 'https://github.com/Dmocken/napcat-plugin-group-manager',
        label: 'GitHub',
        title: 'GitHub 仓库',
    },
    {
        href: 'https://www.dmocken.top',
        label: 'Dmocken',
        title: '作者主页',
        icon: 'https://q1.qlogo.cn/g?b=qq&nk=3347510139&s=640',
    },
];

/** 左侧主导航：固定宽度，页面切换只换右侧内容 */
export function SideNav(): React.JSX.Element {
    const page = useStore((s) => s.page);
    const setPage = useStore((s) => s.setPage);
    const status = useStore((s) => s.status);
    const global = useStore((s) => s.global);
    const profiles = useStore((s) => s.profiles);
    const dirty = useStore((s) => s.dirty);
    const liveUptime = useLiveUptime(status?.uptimeSeconds, status?.serverTime);

    // 没有未保存的修改时，直接用后端返回的实时汇总，避免别处的改动在这里看不到
    const summary = status?.summary;
    const useLive = !dirty && Boolean(summary);
    const enabled = (useLive ? status?.global.enabled : global.enabled) !== false;
    const bound = useLive
        ? (summary?.groups ?? 0)
        : profiles.reduce((sum, item) => sum + item.group_ids.length, 0);
    const profileCount = useLive ? (summary?.profiles ?? 0) : profiles.length;
    const uptime = liveUptime === undefined ? (status?.uptime ?? '—') : formatUptime(liveUptime);

    return (
        <aside className="flex w-[232px] shrink-0 flex-col border-r border-line bg-surface">
            <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
                <span className="grid size-7 place-items-center rounded-control border border-line bg-surface-2 text-ink">
                    <Shield className="size-4" />
                </span>
                <div className="min-w-0">
                    <div className="truncate text-[13px] leading-4 font-semibold text-ink">
                        群管插件
                    </div>
                    <div
                        className="truncate text-[11px] leading-4 text-subtle"
                        title={`构建于 ${__BUILD_TIME__}`}
                    >
                        {status ? `v${status.version}` : '加载中…'}
                        <span className="ml-1.5 font-mono-num text-[10px] opacity-70">
                            {__BUILD_COMMIT__}
                        </span>
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
                            {bound} / {profileCount}
                        </dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt>已运行</dt>
                        <dd className="font-mono-num text-muted">{uptime}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                        <dt>当前时间</dt>
                        <Clock />
                    </div>
                </dl>

                <div className="mt-4 grid grid-cols-2 divide-x divide-line border-y border-line">
                    {LINKS.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            target="_blank"
                            rel="noreferrer"
                            title={link.title}
                            className="flex min-w-0 items-center justify-center gap-1.5 px-2 py-2 text-[11px] text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                            {link.icon ? (
                                <img
                                    src={link.icon}
                                    alt=""
                                    className="size-3.5 shrink-0 rounded-full object-cover"
                                />
                            ) : (
                                <GithubMark className="size-3.5 shrink-0" />
                            )}
                            <span className="truncate">{link.label}</span>
                        </a>
                    ))}
                </div>
            </div>
        </aside>
    );
}
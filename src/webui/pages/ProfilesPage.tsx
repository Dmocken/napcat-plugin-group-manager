import { Layers, Plus } from 'lucide-react';

import { ProfileDetail } from '@/components/profile/ProfileDetail';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/panel';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/** 群配置页：左侧配置列表 + 右侧单条配置详情 */
export function ProfilesPage(): React.JSX.Element {
    const profiles = useStore((s) => s.profiles);
    const activeId = useStore((s) => s.activeProfileId);
    const setActiveId = useStore((s) => s.setActiveProfileId);
    const addProfile = useStore((s) => s.addProfile);

    const activeIndex = profiles.findIndex((item) => item.id === activeId);
    const active = activeIndex >= 0 ? profiles[activeIndex] : null;

    return (
        <div className="flex h-[calc(100vh-170px)] gap-5">
            <div className="flex w-[264px] shrink-0 flex-col overflow-hidden rounded-panel border border-line bg-surface">
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <span className="text-[13px] font-semibold text-ink">群配置</span>
                    <span className="text-[11px] text-subtle">{profiles.length} 条</span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                    {profiles.map((profile, index) => {
                        const selected = profile.id === activeId;
                        const enabled = Object.values(profile.features).filter(
                            (item) => item.enabled,
                        ).length;
                        return (
                            <button
                                key={profile.id}
                                type="button"
                                onClick={() => setActiveId(profile.id)}
                                aria-current={selected ? 'true' : undefined}
                                className={cn(
                                    'mb-1 flex w-full cursor-pointer flex-col rounded-control px-3 py-2.5 text-left transition-colors',
                                    selected ? 'bg-surface-3' : 'hover:bg-surface-2',
                                )}
                            >
                                <span className="flex items-center gap-2">
                                    {selected ? (
                                        <span className="size-1.5 shrink-0 rounded-full bg-inverse" />
                                    ) : null}
                                    <span className="truncate text-[13px] text-ink-2">
                                        {profile.label || '未命名配置'}
                                    </span>
                                    <span className="ml-auto shrink-0 font-mono-num text-[11px] text-subtle">
                                        #{index + 1}
                                    </span>
                                </span>
                                <span className="mt-1 flex items-center gap-2 text-[11px] text-subtle">
                                    <span>{profile.group_ids.length} 个群</span>
                                    <span>·</span>
                                    <span>启用 {enabled}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="border-t border-line p-2">
                    <Button className="w-full" onClick={addProfile}>
                        <Plus className="size-3.5" />
                        新增群配置
                    </Button>
                </div>
            </div>
            {active ? (
                <ProfileDetail profile={active} index={activeIndex} />
            ) : (
                <EmptyState
                    className="flex-1"
                    icon={<Layers className="size-6" />}
                    title="还没有群配置"
                    description="一条配置可以绑定多个群，配置相同的群放在一起维护；功能开关与参数都在这条配置里生效。"
                    action={
                        <Button variant="primary" onClick={addProfile}>
                            <Plus className="size-3.5" />
                            新增群配置
                        </Button>
                    }
                />
            )}
        </div>
    );
}

import { Check, ChevronDown, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tag } from '@/components/ui/tag';
import type { GroupProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/** 绑定群：下拉多选（选中即绑定，再点取消），支持搜索与手动添加群号 */
export function GroupSelect({ profile }: { profile: GroupProfile }): React.JSX.Element {
    const groups = useStore((s) => s.groups);
    const profiles = useStore((s) => s.profiles);
    const toggleGroup = useStore((s) => s.toggleGroup);
    const removeGroup = useStore((s) => s.removeGroup);
    const addGroup = useStore((s) => s.addGroup);
    const toast = useStore((s) => s.toast);

    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [manual, setManual] = useState('');

    /** 归属判断以本地数据为准（服务端快照在编辑期间是旧的） */
    const owners = useMemo(() => {
        const map: Record<string, GroupProfile> = {};
        profiles.forEach((item) => {
            if (item.id === profile.id) return;
            (item.group_ids ?? []).forEach((gid) => {
                map[String(gid)] = item;
            });
        });
        return map;
    }, [profiles, profile.id]);

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return groups;
        return groups.filter(
            (group) =>
                String(group.group_id).includes(kw) ||
                (group.group_name || '').toLowerCase().includes(kw),
        );
    }, [groups, keyword]);

    const infoOf = (gid: string): { group_name?: string } | null =>
        groups.find((group) => String(group.group_id) === String(gid)) ?? null;

    const submitManual = (): void => {
        if (addGroup(profile.id, manual.trim())) setManual('');
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
                {profile.group_ids.length === 0 ? (
                    <p className="text-xs text-subtle">
                        还没有绑定任何群 —— 未绑定任何配置的群，功能都不会生效。
                    </p>
                ) : (
                    profile.group_ids.map((gid) => {
                        const info = infoOf(gid);
                        const name = info ? info.group_name || '未命名群' : '未知群';
                        return (
                            <Tag key={gid} onRemove={() => removeGroup(profile.id, gid)}>
                                {name} <span className="font-mono-num opacity-60">{gid}</span>
                            </Tag>
                        );
                    })
                )}
            </div>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="flex h-9 w-[320px] cursor-pointer items-center gap-2 rounded-control border border-line bg-surface-2 px-3 text-[13px] text-ink-2 transition-colors hover:border-line-strong"
                    >
                        <Users className="size-3.5 text-subtle" />
                        {profile.group_ids.length
                            ? `已绑定 ${profile.group_ids.length} 个群`
                            : '选择群'}
                        <ChevronDown
                            className={cn(
                                'ml-auto size-3.5 text-subtle transition-transform',
                                open && 'rotate-180',
                            )}
                        />
                    </button>
                </PopoverTrigger>

                <PopoverContent width={520}>
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
                        <Input
                            className="pl-8"
                            value={keyword}
                            placeholder="搜索群号 / 群名"
                            onChange={(event) => setKeyword(event.target.value)}
                        />
                    </div>

                    <div className="mt-2 max-h-[300px] overflow-auto">
                        {filtered.length === 0 ? (
                            <p className="px-1 py-3 text-xs text-subtle">
                                没有匹配的群；插件需要先收到一次群消息才会拉取群列表，也可以在下方手动填群号。
                            </p>
                        ) : (
                            filtered.map((group) => {
                                const gid = String(group.group_id);
                                const selected = profile.group_ids.includes(gid);
                                const owner = owners[gid];
                                return (
                                    <button
                                        key={gid}
                                        type="button"
                                        disabled={Boolean(owner)}
                                        onClick={() =>
                                            owner
                                                ? toast(`该群已被「${owner.label}」绑定`)
                                                : toggleGroup(profile.id, gid)
                                        }
                                        className={cn(
                                            'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[13px] transition-colors',
                                            owner
                                                ? 'cursor-not-allowed opacity-45'
                                                : 'cursor-pointer hover:bg-surface-3',
                                            selected && 'bg-surface-3',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'grid size-4 shrink-0 place-items-center rounded-[4px] border',
                                                selected
                                                    ? 'border-inverse bg-inverse text-inverse-ink'
                                                    : 'border-line',
                                            )}
                                        >
                                            {selected ? <Check className="size-3" /> : null}
                                        </span>
                                        <span className="truncate text-ink-2">
                                            {group.group_name || '未命名群'}
                                        </span>
                                        <span className="font-mono-num text-[11px] text-subtle">
                                            {gid}
                                            {group.member_count ? ` · ${group.member_count} 人` : ''}
                                        </span>
                                        {owner ? (
                                            <span className="ml-auto shrink-0 text-[11px] text-subtle">
                                                已被「{owner.label}」绑定
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2.5">
                        <span className="shrink-0 text-xs text-subtle">列表里没有？</span>
                        <Input
                            className="h-8 w-[160px] font-mono-num"
                            value={manual}
                            placeholder="手动填群号"
                            onChange={(event) => setManual(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    submitManual();
                                }
                            }}
                        />
                        <Button size="sm" onClick={submitManual}>
                            添加
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    );
}

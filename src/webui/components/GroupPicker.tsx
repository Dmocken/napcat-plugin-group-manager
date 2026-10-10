import { Check, ChevronDown, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tag } from '@/components/ui/tag';
import { cn, isQq } from '@/lib/utils';
import { useStore } from '@/store';

interface GroupOption {
    gid: string;
    name: string;
    count: number;
    /** 来自快照 / 手动添加，不在 bot 已加入的群列表里 */
    external: boolean;
}

/**
 * 群多选：搜索多选 + 手动填群号（受控组件），选中项以胶囊展示。
 * extraGroupIds 用于把「bot 不在、但成员快照里有记录」的群也列出来供勾选。
 */
export function GroupPicker({
    selected,
    onChange,
    extraGroupIds,
    triggerLabel = '选择群',
    emptyHint = '还没有选择群。',
}: {
    selected: string[];
    onChange: (next: string[]) => void;
    extraGroupIds?: string[];
    triggerLabel?: string;
    emptyHint?: string;
}): React.JSX.Element {
    const groups = useStore((s) => s.groups);
    const toast = useStore((s) => s.toast);

    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [manual, setManual] = useState('');

    const options = useMemo<GroupOption[]>(() => {
        const list: GroupOption[] = groups.map((g) => ({
            gid: String(g.group_id),
            name: g.group_name || '未命名群',
            count: g.member_count ?? 0,
            external: false,
        }));
        const known = new Set(list.map((item) => item.gid));
        (extraGroupIds ?? []).forEach((id) => {
            const gid = String(id);
            if (!gid || known.has(gid)) return;
            known.add(gid);
            list.push({ gid, name: '快照里的群', count: 0, external: true });
        });
        return list;
    }, [groups, extraGroupIds]);

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return options;
        return options.filter(
            (item) => item.gid.includes(kw) || item.name.toLowerCase().includes(kw),
        );
    }, [options, keyword]);

    const nameOf = (gid: string): string =>
        options.find((item) => item.gid === gid)?.name ?? gid;

    const toggle = (gid: string): void => {
        onChange(selected.includes(gid) ? selected.filter((x) => x !== gid) : [...selected, gid]);
    };

    const submitManual = (): void => {
        const value = manual.trim();
        if (!isQq(value)) {
            toast('请输入正确的群号', 'err');
            return;
        }
        if (selected.includes(value)) {
            toast('该群已在列表里');
            return;
        }
        onChange([...selected, value]);
        setManual('');
    };

    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
                {selected.length === 0 ? (
                    <p className="text-xs text-subtle">{emptyHint}</p>
                ) : (
                    selected.map((gid) => (
                        <Tag key={gid} onRemove={() => toggle(gid)}>
                            {nameOf(gid)} <span className="font-mono-num opacity-60">{gid}</span>
                        </Tag>
                    ))
                )}
            </div>

            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className="flex h-9 w-[320px] cursor-pointer items-center gap-2 rounded-control border border-line bg-surface-2 px-3 text-[13px] text-ink-2 transition-colors hover:border-line-strong"
                    >
                        <Users className="size-3.5 text-subtle" />
                        {selected.length ? `已选 ${selected.length} 个群` : triggerLabel}
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
                            placeholder="搜索群号 / 群名（bot 已加入的群 + 快照里的群）"
                            onChange={(event) => setKeyword(event.target.value)}
                        />
                    </div>

                    <div className="mt-2 max-h-[280px] overflow-auto">
                        {filtered.length === 0 ? (
                            <p className="px-1 py-3 text-xs text-subtle">
                                没有匹配的群 —— 可以在下方手动填群号（需要成员快照里已有该群的数据）。
                            </p>
                        ) : (
                            filtered.map((item) => {
                                const active = selected.includes(item.gid);
                                return (
                                    <button
                                        key={item.gid}
                                        type="button"
                                        onClick={() => toggle(item.gid)}
                                        aria-pressed={active}
                                        className={cn(
                                            'flex w-full cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-3',
                                            active && 'bg-surface-3',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'grid size-4 shrink-0 place-items-center rounded-[4px] border',
                                                active
                                                    ? 'border-inverse bg-inverse text-inverse-ink'
                                                    : 'border-line',
                                            )}
                                        >
                                            {active ? <Check className="size-3" /> : null}
                                        </span>
                                        <span className="truncate text-ink-2">{item.name}</span>
                                        <span className="font-mono-num text-[11px] text-subtle">
                                            {item.gid}
                                            {item.count ? ` · ${item.count} 人` : ''}
                                        </span>
                                        {item.external ? (
                                            <span className="ml-auto shrink-0 text-[11px] text-subtle">
                                                来自快照
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="mt-2 flex items-center gap-2 border-t border-line pt-2.5">
                        <span className="shrink-0 text-xs text-subtle">bot 不在的群：</span>
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

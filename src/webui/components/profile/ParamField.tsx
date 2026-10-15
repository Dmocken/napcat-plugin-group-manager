import { Bell, Bot, Check, ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { GroupPicker } from '@/components/GroupPicker';
import { TagListEditor } from '@/components/TagListEditor';
import { Button } from '@/components/ui/button';
import { IdentityAvatar } from '@/components/ui/identity';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SwitchField } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { NUMBERLIST_SPLITTER, WORDLIST_SPLITTER, sameValue } from '@/lib/constants';
import type { ParamMeta } from '@/lib/types';
import { cloneDefault, cn } from '@/lib/utils';
import { useStore } from '@/store';

/* ---------------- 群列表参数：勾选参与查重的群（含快照里记录过的群） ---------------- */

function GroupListField({
    value,
    onChange,
}: {
    value: unknown;
    onChange: (value: unknown) => void;
}): React.JSX.Element {
    const snapshot = useStore((s) => s.dupSnapshot);
    const list = Array.isArray(value) ? value.map(String) : [];

    // 快照里记录过的群（含 bot 不在的群）也列出来，并带上群名
    const extraGroups = useMemo(
        () =>
            (snapshot?.groupIds ?? []).map((gid) => ({
                gid,
                name: snapshot?.groupNames?.[gid] ?? '',
            })),
        [snapshot],
    );

    return (
        <GroupPicker
            selected={list}
            onChange={(next) => onChange(next)}
            extraGroups={extraGroups}
            triggerLabel="选择参与查重的群"
            emptyHint="还没有选择群 —— 默认不勾选，需要手动选择。"
        />
    );
}

/* ---------------- 词表类参数：多个子词表，各自一个胶囊列表 ---------------- */

function WordListsField({
    param,
    value,
    onChange,
}: {
    param: ParamMeta;
    value: unknown;
    onChange: (value: unknown) => void;
}): React.JSX.Element {
    const map = (value && typeof value === 'object' ? value : {}) as Record<string, string[]>;

    return (
        <div className="space-y-3">
            {(param.subKeys ?? []).map((sub) => {
                const list = Array.isArray(map[sub.key]) ? map[sub.key] : [];
                return (
                    <div key={sub.key}>
                        <div className="mb-1.5 flex items-center gap-2">
                            <span className="text-[13px] text-ink-2">{sub.label}</span>
                            <span className="rounded-full border border-line px-1.5 text-[11px] leading-4 text-subtle">
                                {list.length} 项
                            </span>
                            {!list.length ? (
                                <span className="text-[11px] text-subtle">留空则使用内置词表</span>
                            ) : null}
                        </div>
                        <TagListEditor
                            list={list}
                            onChange={(next) => onChange({ ...map, [sub.key]: next })}
                            placeholder="回车添加，支持用逗号一次粘贴多个"
                            inputWidth={320}
                            splitter={WORDLIST_SPLITTER}
                            scroll
                        />
                    </div>
                );
            })}
        </div>
    );
}

/* ---------------- 级联选择（下拉弹层）：左侧群列表，右侧勾选具体通知的人 ---------------- */

function CascadeField({
    value,
    onChange,
}: {
    param: ParamMeta;
    value: unknown;
    onChange: (value: unknown) => void;
}): React.JSX.Element {
    const globalAdmins = useStore((s) => s.global?.global_admins ?? []);
    const activeId = useStore((s) => s.activeProfileId);
    const profiles = useStore((s) => s.profiles);
    const groups = useStore((s) => s.groups);
    const friends = useStore((s) => s.friends);
    const managers = useStore((s) => s.groupManagers);
    const loadManagers = useStore((s) => s.loadGroupManagers);

    const [open, setOpen] = useState(false);
    const [selectedKey, setSelectedKey] = useState('bot');
    const [loadingId, setLoadingId] = useState('');

    /** 存储结构：{ bot: Bot管理QQ[]（空 = 全部）, 群号: 该群勾选的群主/管理员QQ[] } */
    const config = (
        value && typeof value === 'object' && !Array.isArray(value) ? value : {}
    ) as Record<string, string[]>;

    const groupNameOf = useCallback(
        (gid: string): string =>
            groups.find((g) => String(g.group_id) === gid)?.group_name ?? '',
        [groups],
    );
    const friendName = useCallback(
        (qq: string): string => {
            const f = friends.find((x) => String(x.user_id) === qq);
            return f ? f.remark || f.nickname : '';
        },
        [friends],
    );

    const groupIds = useMemo(
        () => profiles.find((p) => p.id === activeId)?.group_ids ?? [],
        [profiles, activeId],
    );

    // 左列条目 = Bot 主人组 + 配置组绑定的群
    const items = useMemo(
        () => [
            { key: 'bot', label: 'Bot 主人', meta: '任何群的失败都通知' },
            ...groupIds.map((gid) => ({
                key: gid,
                label: groupNameOf(gid) || '未知群',
                meta: gid,
            })),
        ],
        [groupIds, groupNameOf],
    );

    // 切配置组 / 群列表变化后选中的 key 可能失效，回退到 Bot 主人
    const current = items.some((item) => item.key === selectedKey) ? selectedKey : 'bot';

    // 选中某个群且缓存里没有 → 拉一次群主 / 管理员
    useEffect(() => {
        if (!open || current === 'bot' || managers[current] || loadingId) return;
        let alive = true;
        setLoadingId(current);
        void loadManagers(current).finally(() => {
            if (alive) setLoadingId('');
        });
        return () => {
            alive = false;
        };
    }, [open, current, managers, loadingId, loadManagers]);

    const botList = (Array.isArray(config.bot) ? config.bot : []).map(String);
    const checked = current === 'bot' ? [] : (Array.isArray(config[current]) ? config[current] : []).map(String);

    const toggleBot = (qq: string): void => {
        onChange({
            ...config,
            bot: botList.includes(qq) ? botList.filter((x) => x !== qq) : [...botList, qq],
        });
    };
    const toggleGroupUser = (qq: string): void => {
        onChange({
            ...config,
            [current]: checked.includes(qq) ? checked.filter((x) => x !== qq) : [...checked, qq],
        });
    };

    /** 触发器文案：当前配置的一句话摘要 */
    const botPart =
        botList.length > 0 ? `Bot 主人 ${botList.length} 人` : 'Bot 主人（全部）';
    const configuredGroups = groupIds.filter((gid) => (config[gid]?.length ?? 0) > 0).length;
    const summary =
        groupIds.length > 0
            ? `${botPart} · ${configuredGroups}/${groupIds.length} 群已勾选`
            : botPart;

    const rowCls = (active: boolean): string =>
        cn(
            'flex w-full cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-left transition-colors',
            active ? 'bg-surface-3' : 'hover:bg-surface-2',
        );

    /** 右列的一行可勾选用户：头像 + 名称 + 号码 + 选中标记 */
    const userRow = (
        key: string,
        userId: string,
        name: string,
        badge: string,
        active: boolean,
        onToggle: () => void,
    ): React.JSX.Element => (
        <button key={key} type="button" aria-pressed={active} onClick={onToggle} className={rowCls(active)}>
            <IdentityAvatar kind="user" id={userId} />
            <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                    <span
                        className={cn(
                            'shrink-0 rounded-full border px-1.5 text-[10px] leading-4',
                            active
                                ? 'border-inverse/40 bg-inverse text-inverse-ink'
                                : 'border-line text-subtle',
                        )}
                    >
                        {badge}
                    </span>
                    <span className="min-w-0 truncate text-[12px] leading-4 text-ink">
                        {name || userId}
                    </span>
                </span>
                <span className="truncate font-mono-num text-[10px] leading-4 text-subtle">
                    {userId}
                </span>
            </span>
            {active ? <Check className="size-4 shrink-0 text-ink" /> : null}
        </button>
    );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-control border border-line bg-surface-2 px-2.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong"
                >
                    <Bell className="size-3.5 shrink-0 text-subtle" />
                    <span className="min-w-0 flex-1 truncate text-left">{summary}</span>
                    <ChevronDown
                        className={cn(
                            'size-3.5 shrink-0 text-subtle transition-transform',
                            open && 'rotate-180',
                        )}
                    />
                </button>
            </PopoverTrigger>

            <PopoverContent width={480} className="overflow-hidden p-0">
                <div className="flex h-[300px]">
                    {/* 左列：群列表 */}
                    <div className="w-[190px] shrink-0 overflow-auto border-r border-line p-1.5">
                        {items.map((item) => {
                            const active = item.key === current;
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setSelectedKey(item.key)}
                                    className={cn(
                                        'flex w-full cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors',
                                        active ? 'bg-surface-3' : 'hover:bg-surface-2',
                                    )}
                                >
                                    {item.key === 'bot' ? (
                                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-subtle">
                                            <Bot className="size-3.5" />
                                        </span>
                                    ) : (
                                        <IdentityAvatar kind="group" id={item.key} />
                                    )}
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span
                                            className={cn(
                                                'truncate text-[12px] leading-4',
                                                active ? 'text-ink' : 'text-ink-2',
                                            )}
                                        >
                                            {item.label}
                                        </span>
                                        <span className="truncate font-mono-num text-[10px] leading-4 text-subtle">
                                            {item.meta}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 右列：勾选通知对象 */}
                    <div className="min-w-0 flex-1 overflow-auto p-1.5">
                        {current === 'bot' ? (
                            globalAdmins.length ? (
                                <>
                                    {globalAdmins.map((qq) =>
                                        userRow(
                                            String(qq),
                                            String(qq),
                                            friendName(String(qq)),
                                            'Bot 主人',
                                            botList.includes(String(qq)),
                                            () => toggleBot(String(qq)),
                                        ),
                                    )}
                                    {!botList.length ? (
                                        <p className="px-2 pt-2 text-[11px] text-subtle">
                                            不勾选任何人 = 通知全部 Bot 主人
                                        </p>
                                    ) : null}
                                </>
                            ) : (
                                <p className="px-2 pt-2 text-[11px] text-subtle">
                                    插件配置里还没有 Bot 管理员，勾选了也没有人能收到通知
                                </p>
                            )
                        ) : loadingId === current ? (
                            <p className="px-2 pt-2 text-[11px] text-subtle">正在读取群主 / 管理员…</p>
                        ) : managers[current]?.error ? (
                            <p className="px-2 pt-2 text-[11px] text-subtle">
                                拉取失败：{managers[current]?.error}（机器人可能已不在该群）
                            </p>
                        ) : managers[current]?.owner || managers[current]?.admins.length ? (
                            (() => {
                                const info = managers[current];
                                if (!info) return null;
                                const owner = info.owner;
                                return (
                                    <>
                                        {owner
                                            ? userRow(
                                                  `owner-${owner.userId}`,
                                                  owner.userId,
                                                  owner.name || friendName(owner.userId),
                                                  '群主',
                                                  checked.includes(owner.userId),
                                                  () => toggleGroupUser(owner.userId),
                                              )
                                            : null}
                                        {info.admins.map((admin) =>
                                            userRow(
                                                `admin-${admin.userId}`,
                                                admin.userId,
                                                admin.name || friendName(admin.userId),
                                                '管理员',
                                                checked.includes(admin.userId),
                                                () => toggleGroupUser(admin.userId),
                                            ),
                                        )}
                                        {!checked.length ? (
                                            <p className="px-2 pt-2 text-[11px] text-subtle">
                                                不勾选 = 这个群的判断失败只通知 Bot 主人组勾选的人
                                            </p>
                                        ) : null}
                                    </>
                                );
                            })()
                        ) : (
                            <p className="px-2 pt-2 text-[11px] text-subtle">
                                这个群没有群主 / 管理员，判断失败时只通知 Bot 主人组勾选的人
                            </p>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}

/* ---------------- 单个参数的控件 ---------------- */

function ParamControl({
    param,
    value,
    onChange,
}: {
    param: ParamMeta;
    value: unknown;
    onChange: (value: unknown) => void;
}): React.ReactNode {
    switch (param.type) {
        case 'boolean':
            // 兼容早期可能存成 0 / 1 的旧值
            return (
                <SwitchField
                    checked={value === true || value === 1}
                    onCheckedChange={(checked) => onChange(checked)}
                    label={value === true || value === 1 ? '开启' : '关闭'}
                />
            );
        case 'number':
            return (
                <Input
                    type="number"
                    className="font-mono-num"
                    value={value === undefined || value === null ? '' : String(value)}
                    onChange={(event) => onChange(Number(event.target.value))}
                />
            );
        case 'password':
            return (
                <Input
                    type="password"
                    autoComplete="new-password"
                    className="font-mono-num"
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => onChange(event.target.value)}
                />
            );
        case 'textarea':
            return (
                <Textarea
                    rows={3}
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => onChange(event.target.value)}
                />
            );
        case 'numberlist':
            return (
                <Textarea
                    rows={2}
                    className="font-mono-num"
                    value={(Array.isArray(value) ? value : []).join(', ')}
                    onChange={(event) =>
                        onChange(
                            event.target.value
                                .split(NUMBERLIST_SPLITTER)
                                .filter(Boolean)
                                .map(Number),
                        )
                    }
                />
            );
        case 'wordlists':
            return <WordListsField param={param} value={value} onChange={onChange} />;
        case 'grouplist':
            return <GroupListField value={value} onChange={onChange} />;
        case 'cascade':
            return <CascadeField param={param} value={value} onChange={onChange} />;
        case 'select': {
            const options = param.options ?? [];
            const current = typeof value === 'string' ? value : String(param.default ?? '');
            return (
                <div className="flex w-full gap-1 rounded-control border border-line bg-surface-2 p-1">
                    {options.map((option) => {
                        const active = option.value === current;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                aria-pressed={active}
                                onClick={() => onChange(option.value)}
                                className={cn(
                                    'flex-1 cursor-pointer rounded-[5px] px-2 py-1.5 text-[13px] transition-colors',
                                    active
                                        ? 'bg-inverse text-inverse-ink'
                                        : 'text-muted hover:bg-surface-3 hover:text-ink',
                                )}
                            >
                                {option.label}
                            </button>
                        );
                    })}
                </div>
            );
        }
        case 'text':
        default: {
            const text = typeof value === 'string' ? value : '';
            // 长的默认文案用多行输入，避免在窄容器里横向拉长
            const long = typeof param.default === 'string' && param.default.length > 60;
            return long ? (
                <Textarea
                    rows={2}
                    value={text}
                    onChange={(event) => onChange(event.target.value)}
                />
            ) : (
                <Input value={text} onChange={(event) => onChange(event.target.value)} />
            );
        }
    }
}

/** 单个参数：标签 + 控件 + 说明；相对默认值有改动时可一键还原 */
export function ParamField({
    param,
    value,
    onChange,
}: {
    param: ParamMeta;
    value: unknown;
    onChange: (value: unknown) => void;
}): React.JSX.Element {
    const modified = !sameValue(value, param.default);
    const showRestore = modified && param.default !== undefined && param.default !== '';

    return (
        <div
            className={cn(
                'flex min-w-0 flex-col gap-1.5',
                (param.type === 'wordlists' || param.type === 'grouplist' || param.type === 'cascade') &&
                    'col-span-full',
            )}
        >
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] text-ink-2">{param.label}</span>
                {showRestore ? (
                    <Button
                        variant="underline"
                        onClick={() => onChange(cloneDefault(param.default))}
                        title="恢复为内置默认值"
                    >
                        恢复默认
                    </Button>
                ) : null}
            </div>
            <ParamControl param={param} value={value} onChange={onChange} />
            {param.hint ? (
                <span className="text-xs leading-relaxed text-subtle">{param.hint}</span>
            ) : null}
        </div>
    );
}
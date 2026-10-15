import {
    BookMarked,
    ChevronDown,
    ChevronRight,
    Gavel,
    History,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    ShieldBan,
    Trash2,
    Trophy,
    Users,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { IdentityAvatar, IdentityCell } from '@/components/ui/identity';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useServerNow } from '@/lib/server-clock';
import type {
    BanRecordRow,
    BlackRecordRow,
    BlacklistRow,
    GroupInfo,
    GroupProfile,
    RecallRow,
    SmStatRow,
} from '@/lib/types';
import { cn, isQq } from '@/lib/utils';
import { useStore } from '@/store';

/** 「没有记录群」的分组键（老黑历史数据没有 group_id） */
const NO_GROUP = '';

/* ---------------- 工具 ---------------- */

/** 秒数 → 人类可读时长 */
function durationText(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    if (s >= 86400) return `${Math.floor(s / 86400)}天${Math.floor((s % 86400) / 3600)}小时`;
    if (s >= 3600) return `${Math.floor(s / 3600)}小时${Math.floor((s % 3600) / 60)}分`;
    if (s >= 60) return `${Math.floor(s / 60)}分${s % 60}秒`;
    return `${s}秒`;
}

/** 秒级时间戳 → MM-DD HH:MM */
function timeText(ts: number): string {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString('zh-CN', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** 群名 / 好友昵称解析（拿不到就只显示号码） */
function useNames(): {
    profiles: GroupProfile[];
    groups: GroupInfo[];
    groupName: (groupId: string) => string;
    userName: (userId: string) => string;
} {
    const profiles = useStore((s) => s.profiles);
    const groups = useStore((s) => s.groups);
    const friends = useStore((s) => s.friends);

    const groupName = useCallback(
        (groupId: string): string =>
            groups.find((g) => String(g.group_id) === String(groupId))?.group_name ?? '',
        [groups],
    );
    const userName = useCallback(
        (userId: string): string => {
            const friend = friends.find((f) => f.user_id === String(userId));
            return friend ? friend.remark || friend.nickname : '';
        },
        [friends],
    );

    return { profiles, groups, groupName, userName };
}

function groupLabel(groupId: string, groupName: (id: string) => string): string {
    if (!groupId) return '未记录群';
    return groupName(groupId) || '未知群';
}

/* ---------------- 左栏：配置组 → 群 两级树 ---------------- */

interface TreeGroup {
    groupId: string;
    count: number;
}

interface TreeSection {
    key: string;
    label: string;
    count: number;
    /** 概要后缀，例如「2 群」 */
    meta?: string;
    groups: TreeGroup[];
    /** groups 为空时，点击直接选中这个群号 */
    directGroupId?: string;
}

/** 按「记录数 → 群 → 配置组」搭出左栏树；配置组来自「群配置」，顺序也一致 */
function buildSections(counts: Map<string, number>, profiles: GroupProfile[]): TreeSection[] {
    const used = new Set<string>();
    const sections: TreeSection[] = [];

    profiles.forEach((profile) => {
        const groups = profile.group_ids
            .map((groupId) => ({ groupId, count: counts.get(groupId) ?? 0 }))
            .filter((item) => item.count > 0);
        groups.forEach((item) => used.add(item.groupId));

        sections.push({
            key: profile.id,
            label: profile.label,
            count: groups.reduce((sum, item) => sum + item.count, 0),
            meta: `${profile.group_ids.length} 群`,
            groups,
        });
    });

    // 数据里有、但不属于任何配置组的群（解绑了 / 已不在 bot 的群列表里）
    const unbound: TreeGroup[] = [];
    counts.forEach((count, groupId) => {
        if (!groupId || used.has(groupId)) return;
        unbound.push({ groupId, count });
    });
    if (unbound.length) {
        unbound.sort((a, b) => a.groupId.localeCompare(b.groupId));
        sections.push({
            key: '__unbound__',
            label: '未绑定配置',
            count: unbound.reduce((sum, item) => sum + item.count, 0),
            meta: `${unbound.length} 群`,
            groups: unbound,
        });
    }

    // 没有记录群号的老数据（只有黑历史会出现）
    const noGroup = counts.get(NO_GROUP) ?? 0;
    if (noGroup) {
        sections.push({
            key: '__nogroup__',
            label: '未记录群',
            count: noGroup,
            groups: [],
            directGroupId: NO_GROUP,
        });
    }

    return sections;
}

/** 记录按群号计数 */
function countByGroup(list: Array<{ groupId: string }>): Map<string, number> {
    const map = new Map<string, number>();
    list.forEach((item) => map.set(item.groupId, (map.get(item.groupId) ?? 0) + 1));
    return map;
}

function DataTree({
    sections,
    value,
    onChange,
    groupName,
    unit,
}: {
    sections: TreeSection[];
    value: string;
    onChange: (groupId: string) => void;
    groupName: (groupId: string) => string;
    unit: string;
}): React.JSX.Element {
    const [keyword, setKeyword] = useState('');
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    /** 搜索命中：配置组名命中 → 保留全部子群；否则只留命中的子群 */
    const visible = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return sections;
        return sections
            .map((section) => {
                if (section.label.toLowerCase().includes(kw)) return section;
                const groups = section.groups.filter(
                    (group) =>
                        group.groupId.includes(kw) ||
                        groupLabel(group.groupId, groupName).toLowerCase().includes(kw),
                );
                return { ...section, groups };
            })
            .filter(
                (section) =>
                    section.label.toLowerCase().includes(kw) ||
                    section.groups.length > 0 ||
                    section.directGroupId !== undefined,
            );
    }, [sections, keyword, groupName]);

    const badge = (count: number): React.JSX.Element => (
        <span className="shrink-0 rounded-full border border-line px-1.5 text-[11px] leading-4 text-subtle">
            {count}
            {unit}
        </span>
    );

    return (
        <div className="flex w-[208px] shrink-0 flex-col border-r border-line">
            <div className="border-b border-line p-2">
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
                    <Input
                        className="h-8 pl-8"
                        value={keyword}
                        placeholder="搜索群号 / 群名"
                        onChange={(event) => setKeyword(event.target.value)}
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-2">
                {visible.length === 0 ? (
                    <p className="px-2 py-3 text-[11px] text-subtle">没有匹配的群</p>
                ) : (
                    visible.map((section) => {
                        const hasChildren = section.groups.length > 0;
                        const open = !collapsed[section.key];
                        const direct = !hasChildren && section.directGroupId !== undefined;
                        const directActive = direct && section.directGroupId === value;

                        return (
                            <div key={section.key}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (direct) {
                                            onChange(section.directGroupId as string);
                                            return;
                                        }
                                        if (!hasChildren) return;
                                        setCollapsed((prev) => ({
                                            ...prev,
                                            [section.key]: open,
                                        }));
                                    }}
                                    className={cn(
                                        'flex w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-left transition-colors',
                                        directActive ? 'bg-surface-3' : 'hover:bg-surface-2',
                                    )}
                                >
                                    {hasChildren ? (
                                        <ChevronRight
                                            className={cn(
                                                'size-3.5 shrink-0 text-subtle transition-transform',
                                                open && 'rotate-90',
                                            )}
                                        />
                                    ) : (
                                        <span className="size-3.5 shrink-0" />
                                    )}
                                    <span
                                        className={cn(
                                            'min-w-0 flex-1 truncate text-[13px] font-medium',
                                            directActive ? 'text-ink' : 'text-ink-2',
                                        )}
                                    >
                                        {section.label}
                                    </span>
                                    {section.meta ? (
                                        <span className="shrink-0 text-[10px] text-subtle">
                                            {section.meta}
                                        </span>
                                    ) : null}
                                    {badge(section.count)}
                                </button>

                                {hasChildren && open
                                    ? section.groups.map((group) => {
                                          const active = group.groupId === value;
                                          return (
                                              <button
                                                  key={group.groupId}
                                                  type="button"
                                                  onClick={() => onChange(group.groupId)}
                                                  className={cn(
                                                      'flex w-full cursor-pointer items-center gap-2 rounded-control py-1.5 pr-2 pl-6 text-left transition-colors',
                                                      active
                                                          ? 'bg-surface-3'
                                                          : 'hover:bg-surface-2',
                                                  )}
                                              >
                                                  <IdentityAvatar
                                                      kind="group"
                                                      id={group.groupId}
                                                  />
                                                  <span className="flex min-w-0 flex-1 flex-col">
                                                      <span
                                                          className={cn(
                                                              'truncate text-[12px] leading-4',
                                                              active ? 'text-ink' : 'text-ink-2',
                                                          )}
                                                      >
                                                          {groupLabel(
                                                              group.groupId,
                                                              groupName,
                                                          )}
                                                      </span>
                                                      <span className="truncate font-mono-num text-[10px] leading-4 text-subtle">
                                                          {group.groupId}
                                                      </span>
                                                  </span>
                                                  {badge(group.count)}
                                              </button>
                                          );
                                      })
                                    : null}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

/* ---------------- 右栏通用 ---------------- */

function DetailHeader({
    groupId,
    groupName,
    summary,
    actions,
}: {
    groupId: string;
    groupName: (groupId: string) => string;
    summary: string;
    actions?: React.ReactNode;
}): React.JSX.Element {
    return (
        <div className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5">
            <IdentityCell
                kind="group"
                id={groupId}
                name={groupId ? groupName(groupId) : '未记录群'}
            />
            <span className="ml-auto shrink-0 text-[11px] text-subtle">{summary}</span>
            {actions}
        </div>
    );
}

function SectionHint({ children }: { children: React.ReactNode }): React.JSX.Element {
    return (
        <div className="border-t border-line px-4 py-2 text-[11px] leading-relaxed text-subtle">
            {children}
        </div>
    );
}

function EmptyPanel({ text }: { text: string }): React.JSX.Element {
    return <p className="px-5 py-10 text-center text-[13px] text-subtle">{text}</p>;
}

/** 从当前树的第一个可选群取默认选中项 */
function pickActive(sections: TreeSection[], selected: string): string {
    const flat: string[] = [];
    sections.forEach((section) => {
        if (section.groups.length) section.groups.forEach((group) => flat.push(group.groupId));
        else if (section.directGroupId !== undefined) flat.push(section.directGroupId);
    });
    return flat.includes(selected) ? selected : flat[0] ?? NO_GROUP;
}

/* ---------------- 群选择（单选） ---------------- */

function GroupSelectOne({
    value,
    onChange,
    groups,
    groupName,
    placeholder = '不指定群',
    allowEmpty = true,
}: {
    value: string;
    onChange: (groupId: string) => void;
    groups: GroupInfo[];
    groupName: (groupId: string) => string;
    placeholder?: string;
    allowEmpty?: boolean;
}): React.JSX.Element {
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState('');

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return groups;
        return groups.filter(
            (group) =>
                String(group.group_id).includes(kw) ||
                (group.group_name || '').toLowerCase().includes(kw),
        );
    }, [groups, keyword]);

    const label = value ? groupName(value) || value : placeholder;
    const itemClass = (active: boolean): string =>
        cn(
            'flex w-full cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-left text-[12px] transition-colors',
            active ? 'bg-surface-3' : 'hover:bg-surface-3',
        );

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-control border border-line bg-surface-2 px-2.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong"
                >
                    <Users className="size-3.5 shrink-0 text-subtle" />
                    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                    <ChevronDown
                        className={cn(
                            'size-3.5 shrink-0 text-subtle transition-transform',
                            open && 'rotate-180',
                        )}
                    />
                </button>
            </PopoverTrigger>

            {/* 这个选择器只出现在弹窗里：必须内联渲染，否则会被弹窗的 pointer-events 挡住且层级在弹窗下面 */}
            <PopoverContent width={360} portal={false}>
                <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
                    <Input
                        className="pl-8"
                        value={keyword}
                        placeholder="搜索群号 / 群名"
                        onChange={(event) => setKeyword(event.target.value)}
                    />
                </div>

                <div className="mt-2 max-h-[260px] overflow-auto">
                    {allowEmpty ? (
                        <button
                            type="button"
                            onClick={() => {
                                onChange('');
                                setOpen(false);
                            }}
                            className={itemClass(value === '')}
                        >
                            <span className="min-w-0 flex-1 truncate text-ink-2">不指定群</span>
                        </button>
                    ) : null}

                    {filtered.length === 0 ? (
                        <p className="px-2 py-3 text-xs text-subtle">没有匹配的群</p>
                    ) : (
                        filtered.map((group) => {
                            const gid = String(group.group_id);
                            const active = gid === value;
                            return (
                                <button
                                    key={gid}
                                    type="button"
                                    onClick={() => {
                                        onChange(gid);
                                        setOpen(false);
                                    }}
                                    className={itemClass(active)}
                                >
                                    <IdentityAvatar kind="group" id={gid} />
                                    <span className="flex min-w-0 flex-1 flex-col">
                                        <span className="truncate leading-4 text-ink-2">
                                            {group.group_name || '未命名群'}
                                        </span>
                                        <span className="truncate font-mono-num text-[10px] leading-4 text-subtle">
                                            {gid}
                                        </span>
                                    </span>
                                    {active ? (
                                        <span className="shrink-0 text-[11px] text-subtle">当前</span>
                                    ) : null}
                                </button>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}

/* ---------------- 迁移记录 ---------------- */

function MigrateDialog({
    open,
    subject,
    fromGroupId,
    groups,
    groupName,
    onConfirm,
    onClose,
}: {
    open: boolean;
    /** 被迁移的记录描述，例如「阿岚（20001）的禁言记录」 */
    subject: string;
    fromGroupId: string;
    groups: GroupInfo[];
    groupName: (groupId: string) => string;
    onConfirm: (targetGroupId: string) => Promise<void>;
    onClose: () => void;
}): React.JSX.Element {
    const toast = useStore((s) => s.toast);
    const [target, setTarget] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (open) setTarget('');
    }, [open]);

    const submit = async (): Promise<void> => {
        if (!target) {
            toast('请选择要迁移到的群', 'err');
            return;
        }
        if (target === fromGroupId) {
            toast('目标群和当前群是同一个', 'err');
            return;
        }
        setSaving(true);
        try {
            await onConfirm(target);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="max-w-[480px]">
                <div className="p-5">
                    <DialogTitle>迁移记录</DialogTitle>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                        把「{subject}」挂到另一个群下；迁移后它会出现在目标群所属配置组里。
                    </p>
                    <div className="mt-4 space-y-4">
                        <Field label="当前群">
                            <span className="text-[13px] text-ink-2">
                                {groupLabel(fromGroupId, groupName)}
                                <span className="font-mono-num text-subtle">
                                    {' '}
                                    （{fromGroupId || '无群号'}）
                                </span>
                            </span>
                        </Field>
                        <Field label="迁移到" hint="只列出 bot 已加入的群">
                            <GroupSelectOne
                                value={target}
                                onChange={setTarget}
                                groups={groups}
                                groupName={groupName}
                                placeholder="选择目标群"
                                allowEmpty={false}
                            />
                        </Field>
                    </div>
                    <div className="mt-5 flex items-center justify-end gap-2">
                        <Button onClick={onClose}>取消</Button>
                        <Button loading={saving} disabled={!target} onClick={() => void submit()}>
                            确定迁移
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ---------------- 禁言记录 ---------------- */

function LeftBadge({ left, remute }: { left?: boolean; remute?: boolean }): React.JSX.Element {
    // sm / smplus 的禁言不参与重禁，这里直接说明，免得看到「已退群」却等不到重禁
    if (remute === false) {
        return (
            <span title="这条禁言来自 sm / smplus，退群重进时不会重新禁言">
                <Badge variant="dashed">不重禁</Badge>
            </span>
        );
    }
    if (left === true) {
        return (
            <span title="已退群：再次入群（含同配置组的其它群）时会按保留时长重新禁言">
                <Badge variant="strong">已退群</Badge>
            </span>
        );
    }
    if (left === false) {
        return <Badge>在群</Badge>;
    }
    return (
        <span title="老数据或没收到退群通知，无法判断">
            <Badge variant="dashed">未知</Badge>
        </span>
    );
}

/** QQ 群禁言时长上限：30 天（与后端 MAX_BAN_SECONDS 保持一致） */
const MAX_BAN_SECONDS = 30 * 24 * 3600;

interface DurationParts {
    day: number;
    hour: number;
    minute: number;
    second: number;
}

function splitDuration(seconds: number): DurationParts {
    const s = Math.max(0, Math.floor(seconds));
    return {
        day: Math.floor(s / 86400),
        hour: Math.floor((s % 86400) / 3600),
        minute: Math.floor((s % 3600) / 60),
        second: s % 60,
    };
}

function joinDuration(parts: DurationParts): number {
    return parts.day * 86400 + parts.hour * 3600 + parts.minute * 60 + parts.second;
}

/** 天 / 时 / 分 / 秒 下拉：省得手填秒数还要自己换算，也顺手卡住 QQ 的时长上限 */
function DurationSelect({
    label,
    value,
    max,
    onChange,
}: {
    label: string;
    value: number;
    max: number;
    onChange: (value: number) => void;
}): React.JSX.Element {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[12px] text-subtle">{label}</span>
            <select
                value={value}
                onChange={(event) => onChange(Number(event.target.value))}
                className="h-9 w-full cursor-pointer rounded-control border border-line bg-surface-2 px-2 text-[13px] text-ink transition-colors hover:border-line-strong focus:border-ink-2 focus:outline-none"
            >
                {Array.from({ length: max + 1 }, (_, index) => index).map((n) => (
                    <option key={n} value={n}>
                        {n}
                    </option>
                ))}
            </select>
        </div>
    );
}

function BanDurationDialog({
    open,
    row,
    userName,
    now,
    onClose,
}: {
    open: boolean;
    row: BanRecordRow | null;
    userName: string;
    /** 当前服务端秒（与列表同一时间轴，保证两边算出的「已过去」一致） */
    now: number;
    onClose: () => void;
}): React.JSX.Element {
    const update = useStore((s) => s.updateBanDuration);
    const [parts, setParts] = useState<DurationParts>(splitDuration(0));
    const [saving, setSaving] = useState(false);

    // 每次打开都从当前记录的时长起算，避免残留上一次的输入
    useEffect(() => {
        if (open) setParts(splitDuration(row?.duration ?? 0));
    }, [open, row]);

    const total = joinDuration(parts);
    // 后端要求新时长大于「已经过去的时间」，否则这条记录会立刻过期
    const elapsed = row ? Math.max(0, now - row.banTime) : 0;
    const error =
        total <= 0
            ? '时长不能为 0'
            : total > MAX_BAN_SECONDS
              ? '不能超过 30 天（QQ 上限）'
              : total <= elapsed
                ? `必须大于已过去的 ${durationText(elapsed)}`
                : '';

    const submit = async (): Promise<void> => {
        if (!row || error) return;
        setSaving(true);
        try {
            await update(row.groupId, row.userId, total);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="max-w-[460px]">
                <div className="p-5">
                    <DialogTitle>修改保留时长</DialogTitle>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                        {userName || row?.userId}（{row?.userId}）退群重进时，会按这个时长从头重新禁言。
                    </p>
                    <div className="mt-4 grid grid-cols-4 gap-3">
                        <DurationSelect
                            label="天"
                            value={parts.day}
                            // 封顶 29：这样天/时/分/秒怎么组合都不会超过 QQ 的 30 天上限
                            max={29}
                            onChange={(day) => setParts((prev) => ({ ...prev, day }))}
                        />
                        <DurationSelect
                            label="时"
                            value={parts.hour}
                            max={23}
                            onChange={(hour) => setParts((prev) => ({ ...prev, hour }))}
                        />
                        <DurationSelect
                            label="分"
                            value={parts.minute}
                            max={59}
                            onChange={(minute) => setParts((prev) => ({ ...prev, minute }))}
                        />
                        <DurationSelect
                            label="秒"
                            value={parts.second}
                            max={59}
                            onChange={(second) => setParts((prev) => ({ ...prev, second }))}
                        />
                    </div>
                    {/* 只保留校验提示（保存按钮会因此置灰，得让用户知道为什么） */}
                    {error ? <p className="mt-3 text-[12px] text-ink-2">{error}</p> : null}
                    <div className="mt-5 flex items-center justify-end gap-2">
                        <Button onClick={onClose}>取消</Button>
                        <Button
                            loading={saving}
                            disabled={Boolean(error)}
                            onClick={() => void submit()}
                        >
                            保存
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function BanRow({
    row,
    userName,
    now,
    onEditDuration,
    onMigrate,
}: {
    row: BanRecordRow;
    userName: string;
    /** 当前服务端秒（每秒由面板统一传入，避免每行各起一个定时器） */
    now: number;
    onEditDuration: () => void;
    onMigrate: () => void;
}): React.JSX.Element {
    const remove = useStore((s) => s.removeBanRecordRow);
    const unban = useStore((s) => s.unbanMember);
    const askConfirm = useStore((s) => s.askConfirm);

    // 「已禁言 / 剩余」全部由「禁言开始时间 + 总时长」在服务端时间轴上现算：
    // 同一时刻无论渲染多少次结果都一样，5 秒轮询刷新时也就不会跳。
    const elapsed = Math.min(row.duration, Math.max(0, now - row.banTime));
    const remaining = Math.max(0, row.duration - elapsed);
    const expired = remaining <= 0;
    const endsAt = row.banTime + row.duration;

    /** 人还在群里 → 解禁（顺带删条目）；已退群 → 只能删条目 */
    const inGroup = row.left !== true;

    const actOnRow = async (): Promise<void> => {
        const who = `${userName || row.userId}（${row.userId}）`;

        if (inGroup) {
            const ok = await askConfirm(
                '解除禁言',
                `将解除 ${who} 在本群的禁言，并删除这条记录。`,
                'danger',
            );
            if (ok) await unban(row.groupId, row.userId);
            return;
        }

        const ok = await askConfirm(
            '删除记录',
            `将删除 ${who} 的禁言记录；该成员已退群，再次入群后将不会重新禁言。`,
            'danger',
        );
        if (ok) await remove(row.groupId, row.userId);
    };

    return (
        <div className="flex items-center gap-3 border-b border-line/70 px-4 py-2 last:border-b-0">
            <IdentityCell
                kind="user"
                id={row.userId}
                name={userName}
                className="min-w-[168px] flex-1"
            />
            {/* 两段时长最长各 7 个字符（如「29天23小时 / 29天23小时」），给足宽度并禁止换行 */}
            <span className="w-[144px] shrink-0 text-[12px] whitespace-nowrap text-subtle">
                {durationText(elapsed)}
                <span className="text-subtle/70"> / {durationText(row.duration)}</span>
            </span>
            <span
                className={cn(
                    'w-[80px] shrink-0 text-[12px] whitespace-nowrap',
                    expired ? 'text-subtle' : 'text-ink-2',
                )}
                title={expired ? '这条记录已过期，刷新后会被清掉' : undefined}
            >
                {expired ? '已过期' : durationText(remaining)}
            </span>
            <span className="w-[100px] shrink-0 font-mono-num text-[11px] text-subtle">
                {timeText(row.banTime)}
            </span>
            <span className="w-[100px] shrink-0 font-mono-num text-[11px] text-subtle">
                {timeText(endsAt)}
            </span>
            <span className="w-[72px] shrink-0">
                <LeftBadge left={row.left} remute={row.remute} />
            </span>

            {/* 固定宽度（3 个按钮总宽）+ 右对齐：与表头「操作」列同宽；
                富余空间交给上面的「用户」列，行尾不再留一大段空白 */}
            <div className="flex w-[172px] shrink-0 items-center justify-end gap-2">
                {/* 不参与重禁的记录（sm / smplus）改时长没有意义，直接不给入口 */}
                {row.remute === false ? null : (
                    <Button size="xs" variant="ghost" onClick={onEditDuration}>
                        改时长
                    </Button>
                )}
                <Button size="xs" variant="ghost" title="迁移到别的群" onClick={onMigrate}>
                    迁移
                </Button>
                <Button
                    size="xs"
                    variant="ghost"
                    title={inGroup ? '解除群成员禁言并删除这条记录' : '删除这条记录'}
                    onClick={() => void actOnRow()}
                >
                    {inGroup ? '解禁' : '删除'}
                </Button>
            </div>
        </div>
    );
}

function BanRecordsPanel(): React.JSX.Element {
    const rows = useStore((s) => s.banRecords);
    const loading = useStore((s) => s.groupDataLoading);
    const load = useStore((s) => s.loadGroupData);
    const clearRows = useStore((s) => s.clearBanRecordRows);
    const askConfirm = useStore((s) => s.askConfirm);
    const migrate = useStore((s) => s.migrateBanRecord);
    const { profiles, groups, groupName, userName } = useNames();

    const [selected, setSelected] = useState(NO_GROUP);
    const [migrating, setMigrating] = useState<BanRecordRow | null>(null);
    const [editingDuration, setEditingDuration] = useState<BanRecordRow | null>(null);

    // 实时走动：读服务端时间轴上的「现在」，与这批数据是什么时候拉回来的无关，
    // 因此每 5 秒的静默刷新不会让时长跳一下
    const now = useServerNow();

    const sections = useMemo(
        () => buildSections(countByGroup(rows), profiles),
        [rows, profiles],
    );
    const active = pickActive(sections, selected);

    const activeRows = useMemo(
        () => rows.filter((row) => row.groupId === active),
        [rows, active],
    );
    const leftCount = activeRows.filter((row) => row.left === true).length;

    const clearAll = async (): Promise<void> => {
        const ok = await askConfirm(
            '清空禁言记录',
            '将删除全部群的禁言记录，之后退群重进不再按原时长重新禁言。',
            'danger',
        );
        if (ok) await clearRows();
    };

    const clearGroup = async (): Promise<void> => {
        const ok = await askConfirm(
            '清空该群禁言记录',
            `将删除群 ${active} 的 ${activeRows.length} 条禁言记录。`,
            'danger',
        );
        if (ok) await clearRows(active);
    };

    return (
        <>
            <Panel>
                <PanelHeader
                    icon={<Gavel className="size-4" />}
                    title="禁言记录"
                    description="禁言通知里记下的时长，用于「退群重进重新禁言」；同一条配置组下的群互通（换群也躲不掉）。开关在「群配置 → 手动禁言 / 踢人 / 解禁 / 撤回」里按群调整。"
                    actions={
                        <>
                            <Button size="sm" loading={loading} onClick={() => void load()}>
                                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                                刷新
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={!rows.length}
                                onClick={() => void clearAll()}
                            >
                                <Trash2 className="size-3.5" />
                                清空全部
                            </Button>
                        </>
                    }
                />

                {!rows.length ? (
                    <EmptyPanel text="还没有禁言记录 —— 有人被禁言后这里会出现。" />
                ) : (
                    <div className="flex min-h-[440px]">
                        <DataTree
                            sections={sections}
                            value={active}
                            onChange={setSelected}
                            groupName={groupName}
                            unit="人"
                        />

                        <div className="flex min-w-0 flex-1 flex-col">
                            <DetailHeader
                                groupId={active}
                                groupName={groupName}
                                summary={`${activeRows.length} 人 · 已退群 ${leftCount}`}
                                actions={
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        disabled={!activeRows.length}
                                        onClick={() => void clearGroup()}
                                    >
                                        <Trash2 className="size-3.5" />
                                        清空该群
                                    </Button>
                                }
                            />

                            <div className="flex items-center gap-3 border-b border-line bg-surface/80 px-4 py-1.5 text-[11px] text-subtle">
                                <span className="min-w-[168px] flex-1">用户</span>
                                <span className="w-[144px] shrink-0 whitespace-nowrap">
                                    已禁言 / 总时长
                                </span>
                                <span className="w-[80px] shrink-0 whitespace-nowrap">剩余</span>
                                <span className="w-[100px] shrink-0">禁言时间</span>
                                <span className="w-[100px] shrink-0">解禁时间</span>
                                <span className="w-[72px] shrink-0 whitespace-nowrap">是否退群</span>
                                {/* 「操作」列宽必须和行里那三个按钮的总宽一致：用户列是自适应的，
                                    表头与行的固定列宽只要差一点，两边算出来的列宽就会错位 */}
                                <span className="w-[172px] shrink-0 text-right">操作</span>
                            </div>

                            <div className="max-h-[540px] overflow-auto">
                                {activeRows.map((row) => (
                                    <BanRow
                                        key={`${row.groupId}-${row.userId}`}
                                        row={row}
                                        // 优先用记录里存下的群名片，老记录退回好友列表
                                        userName={row.userName || userName(row.userId)}
                                        now={now}
                                        onEditDuration={() => setEditingDuration(row)}
                                        onMigrate={() => setMigrating(row)}
                                    />
                                ))}
                            </div>

                            <SectionHint>
                                「已禁言 / 剩余」按服务端时钟（禁言时间 + 总时长）每秒实时走动，到点会显示「已过期」
                                （刷新后由后端清掉）；列表每 5 秒自动刷新一次，刷新不会让时长跳变。
                                「是否退群」来自退群 / 被踢通知：已退群的记录会在该成员重新入群
                                （含同配置组的其它群）时按「总时长」从头重新禁言 —— 不扣掉已经过去的时间。
                                sm / smplus 的禁言标为「不重禁」，退群重进后不会再禁一次。
                                行尾按钮随状态变：成员还在群里是「解禁」（解除本群禁言 + 删记录，不发群消息），
                                已退群则只是「删除」这条记录。昵称取自禁言时反查到的群名片，反查失败的老记录只显示号码。
                            </SectionHint>
                        </div>
                    </div>
                )}
            </Panel>

            <MigrateDialog
                open={Boolean(migrating)}
                subject={
                    migrating
                        ? `${
                              migrating.userName || userName(migrating.userId) || migrating.userId
                          }（${migrating.userId}）的禁言记录`
                        : ''
                }
                fromGroupId={migrating?.groupId ?? ''}
                groups={groups}
                groupName={groupName}
                onConfirm={(target) =>
                    migrating ? migrate(migrating.groupId, migrating.userId, target) : Promise.resolve()
                }
                onClose={() => setMigrating(null)}
            />

            <BanDurationDialog
                open={Boolean(editingDuration)}
                row={editingDuration}
                userName={
                    editingDuration
                        ? editingDuration.userName || userName(editingDuration.userId)
                        : ''
                }
                now={now}
                onClose={() => setEditingDuration(null)}
            />
        </>
    );
}

/* ---------------- 禁言统计（sm / smplus） ---------------- */

function SmStatRowView({
    row,
    rank,
    userName,
    onRemove,
}: {
    row: SmStatRow;
    rank: number;
    userName: string;
    onRemove: () => void;
}): React.JSX.Element {
    return (
        <div className="flex items-center gap-3 border-b border-line/70 px-4 py-2 last:border-b-0">
            <span className="w-[32px] shrink-0 font-mono-num text-[12px] text-subtle">{rank}</span>
            <IdentityCell
                kind="user"
                id={row.userId}
                name={userName}
                className="min-w-[168px] flex-1"
            />
            {/* 排行按累计时长排，所以这一列用主色，其余是补充信息 */}
            <span className="w-[120px] shrink-0 text-[12px] whitespace-nowrap text-ink-2">
                {durationText(row.total)}
            </span>
            <span className="w-[64px] shrink-0 font-mono-num text-[12px] whitespace-nowrap text-subtle">
                {row.count} 次
            </span>
            <span className="w-[120px] shrink-0 text-[12px] whitespace-nowrap text-subtle">
                {durationText(row.longest)}
            </span>
            <span className="w-[100px] shrink-0 font-mono-num text-[11px] whitespace-nowrap text-subtle">
                {timeText(row.longestAt)}
            </span>
            <div className="flex w-[72px] shrink-0 items-center justify-end">
                <Button size="xs" variant="ghost" title="删除这个用户的统计" onClick={onRemove}>
                    删除
                </Button>
            </div>
        </div>
    );
}

function SmStatsPanel(): React.JSX.Element {
    const rows = useStore((s) => s.smStats);
    const loading = useStore((s) => s.smStatsLoading);
    const load = useStore((s) => s.loadSmStats);
    const remove = useStore((s) => s.removeSmStat);
    const askConfirm = useStore((s) => s.askConfirm);
    const { userName } = useNames();

    const removeRow = async (row: SmStatRow): Promise<void> => {
        const who = `${row.name || userName(row.userId) || row.userId}（${row.userId}）`;
        const ok = await askConfirm(
            '删除禁言统计',
            `将删除 ${who} 的 sm / smplus 禁言统计（最长一次 ${durationText(row.longest)}，` +
                `累计 ${durationText(row.total)} / ${row.count} 次）。` +
                '删除后他不再出现在排行里，之后再被 sm 会从零重新累计。',
            'danger',
        );
        if (ok) await remove(row.userId);
    };

    return (
        <Panel>
            <PanelHeader
                icon={<Trophy className="size-4" />}
                title="禁言统计"
                description="sm / smplus 把谁禁得最狠：跨群按 QQ 累计，不含群号与配置组。只有在「群配置 → 禁言时长统计」里开了的群才会记录。"
                actions={
                    <Button size="sm" loading={loading} onClick={() => void load()}>
                        <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                        刷新
                    </Button>
                }
            />

            {!rows.length ? (
                <EmptyPanel text="还没有禁言统计 —— 群里用 sm / smplus 禁言之后这里会出现。" />
            ) : (
                <div className="flex flex-col">
                    <div className="flex items-center gap-3 border-b border-line bg-surface/80 px-4 py-1.5 text-[11px] text-subtle">
                        <span className="w-[32px] shrink-0">#</span>
                        <span className="min-w-[168px] flex-1">用户</span>
                        <span className="w-[120px] shrink-0 whitespace-nowrap">累计时长</span>
                        <span className="w-[64px] shrink-0">次数</span>
                        <span className="w-[120px] shrink-0 whitespace-nowrap">最长一次</span>
                        <span className="w-[100px] shrink-0 whitespace-nowrap">那次时间</span>
                        <span className="w-[72px] shrink-0 text-right">操作</span>
                    </div>

                    <div className="max-h-[540px] overflow-auto">
                        {rows.map((row, index) => (
                            <SmStatRowView
                                key={row.userId}
                                row={row}
                                rank={index + 1}
                                // 优先用记录里存下的群名片，老记录退回好友列表
                                userName={row.name || userName(row.userId)}
                                onRemove={() => void removeRow(row)}
                            />
                        ))}
                    </div>

                    <SectionHint>
                        按累计时长从长到短排（群里的 sm list / smplus list 是同一个顺序，只取前几名）：
                        「最长一次 / 那次时间」是他被禁得最久的那一次，次数是该群员被
                        sm / smplus 禁言的总次数。数据跨群累计 —— 同一个人在不同群被禁言会算到一起，
                        不记录群号与配置组。关掉「禁言时长统计」后新发生的禁言不再入账，已有数据保留。
                        昵称取自禁言时反查到的群名片，反查失败的老记录退回好友列表，都没有就只显示号码。
                    </SectionHint>
                </div>
            )}
        </Panel>
    );
}

/* ---------------- 拉黑名单 ---------------- */

function BlacklistRowView({
    row,
    userName,
    onRemove,
}: {
    row: BlacklistRow;
    userName: string;
    onRemove: () => void;
}): React.JSX.Element {
    return (
        <div className="flex items-center gap-3 border-b border-line/70 px-4 py-2 last:border-b-0">
            <IdentityCell
                kind="user"
                id={row.userId}
                // 优先用拉黑时反查到的群名片，老记录退回好友列表
                name={row.name || userName}
                className="min-w-[168px] flex-1"
            />
            <span className="w-[140px] shrink-0 text-[12px] whitespace-nowrap text-subtle">
                {timeText(row.at)}
            </span>
            <span className="w-[110px] shrink-0 font-mono-num text-[11px] whitespace-nowrap text-subtle">
                {row.by || '—'}
            </span>
            <span className="min-w-[120px] flex-1 truncate text-[12px] whitespace-nowrap text-ink-2">
                {row.reason || '—'}
            </span>
            <div className="flex w-[72px] shrink-0 items-center justify-end">
                <Button size="xs" variant="ghost" title="解除拉黑" onClick={onRemove}>
                    解除
                </Button>
            </div>
        </div>
    );
}

function BlacklistPanel(): React.JSX.Element {
    const rows = useStore((s) => s.blacklist);
    const loading = useStore((s) => s.blacklistLoading);
    const load = useStore((s) => s.loadBlacklist);
    const removeRow = useStore((s) => s.removeBlacklistRow);
    const askConfirm = useStore((s) => s.askConfirm);
    const { profiles, userName } = useNames();

    const [selected, setSelected] = useState('');

    // 左栏按「配置组」分层（拉黑是配置组级的，没有按群的计数），
    // 用 directGroupId 承载配置组 id —— DataTree 对「没有子节点的段」就是整段可点
    const sections = useMemo<TreeSection[]>(() => {
        const knownIds = new Set(profiles.map((p) => p.id));
        const list: TreeSection[] = profiles
            .map((profile) => ({ profile, own: rows.filter((row) => row.profileId === profile.id) }))
            .filter((item) => item.own.length > 0)
            .map((item) => ({
                key: item.profile.id,
                label: item.profile.label,
                count: item.own.length,
                meta: `${item.profile.group_ids.length} 群`,
                groups: [],
                directGroupId: item.profile.id,
            }));

        // 配置组已经被删掉的孤儿记录（例如整条群配置被删了），单独归一段
        const orphanCount = rows.filter((row) => !knownIds.has(row.profileId)).length;
        if (orphanCount) {
            list.push({
                key: '__orphan__',
                label: '已删除的配置组',
                count: orphanCount,
                groups: [],
                directGroupId: '__orphan__',
            });
        }
        return list;
    }, [rows, profiles]);

    const active = pickActive(sections, selected);
    const activeProfile = profiles.find((p) => p.id === active);
    const activeRows = rows.filter((row) =>
        active === '__orphan__'
            ? !profiles.some((p) => p.id === row.profileId)
            : row.profileId === active,
    );

    const remove = async (row: BlacklistRow): Promise<void> => {
        const who = `${row.name || userName(row.userId) || row.userId}（${row.userId}）`;
        const ok = await askConfirm(
            '解除拉黑',
            `将解除 ${who} 在配置组「${activeProfile?.label ?? row.profileId}」下的拉黑。` +
                '解除后他可以重新申请加入该配置组下的所有群。',
            'danger',
        );
        if (ok) await removeRow(row.profileId, row.userId);
    };

    return (
        <Panel>
            <PanelHeader
                icon={<ShieldBan className="size-4" />}
                title="拉黑名单"
                description="管理员 / Bot 主用 black @用户 或 black QQ号 拉黑的人；拉黑是配置组级的 —— 组内所有群的入群申请（含被邀请）都会被拦截。"
                actions={
                    <Button size="sm" loading={loading} onClick={() => void load()}>
                        <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                        刷新
                    </Button>
                }
            />

            {!rows.length ? (
                <EmptyPanel text="还没有拉黑记录 —— 在群里发送 /black @用户 即可拉黑。" />
            ) : (
                <div className="flex min-h-[440px]">
                    <DataTree
                        sections={sections}
                        value={active}
                        onChange={setSelected}
                        groupName={() => ''}
                        unit="人"
                    />

                    <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center gap-3 border-b border-line bg-surface-2/60 px-4 py-2.5">
                            <IdentityCell
                                kind="group"
                                id={active === '__orphan__' ? '' : active}
                                name={
                                    activeProfile
                                        ? `${activeProfile.label}（${activeProfile.group_ids.length} 群）`
                                        : '已删除的配置组'
                                }
                            />
                            <span className="ml-auto shrink-0 text-[11px] text-subtle">
                                {activeRows.length} 人
                            </span>
                        </div>

                        <div className="max-h-[540px] overflow-auto">
                            {activeRows.map((row) => (
                                <BlacklistRowView
                                    key={`${row.profileId}-${row.userId}`}
                                    row={row}
                                    userName={userName(row.userId)}
                                    onRemove={() => void remove(row)}
                                />
                            ))}
                        </div>

                        <SectionHint>
                            拉黑时间 / 操作人 / 原因都来自群里执行 black 命令的那一刻；昵称是当时反查的，
                            反查失败的老记录只显示号码。解除拉黑只影响入群申请 ——
                            已经在群里的成员不会被踢，要踢请用 kick。拦截是否生效还要看该群是否开启了
                            「拉黑」功能（群配置里），未开启时名单仍会记录但不拦截。
                        </SectionHint>
                    </div>
                </div>
            )}
        </Panel>
    );
}

/* ---------------- 黑历史 ---------------- */

function BlackRecordDialog({
    open,
    record,
    defaultGroupId,
    groups,
    groupName,
    onClose,
}: {
    open: boolean;
    record: BlackRecordRow | null;
    defaultGroupId: string;
    groups: GroupInfo[];
    groupName: (groupId: string) => string;
    onClose: () => void;
}): React.JSX.Element {
    const add = useStore((s) => s.addBlackRecord);
    const update = useStore((s) => s.updateBlackRecord);
    const toast = useStore((s) => s.toast);

    const [groupId, setGroupId] = useState('');
    const [userId, setUserId] = useState('');
    const [text, setText] = useState('');
    const [saving, setSaving] = useState(false);

    // 每次打开时把待编辑的内容灌进表单
    useEffect(() => {
        if (!open) return;
        setGroupId(record ? record.groupId : defaultGroupId);
        setUserId(record ? String(record.userId) : '');
        setText(record?.text ?? '');
    }, [open, record, defaultGroupId]);

    const submit = async (): Promise<void> => {
        const uid = userId.trim();
        if (!isQq(uid)) {
            toast('请输入正确的 QQ 号', 'err');
            return;
        }
        if (!text.trim()) {
            toast('正文不能为空', 'err');
            return;
        }
        setSaving(true);
        try {
            if (record) await update(record.id, { userId: uid, text: text.trim(), groupId });
            else await add(uid, text.trim(), groupId);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <DialogContent className="max-w-[520px]">
                <div className="p-5">
                    <DialogTitle>{record ? `编辑黑历史 #${record.id}` : '新增黑历史'}</DialogTitle>
                    <div className="mt-4 space-y-4">
                        <Field label="所属群" hint="决定这条记录出现在哪个群下面">
                            <GroupSelectOne
                                value={groupId}
                                onChange={setGroupId}
                                groups={groups}
                                groupName={groupName}
                            />
                        </Field>
                        <Field label="用户 QQ 号">
                            <Input
                                className="font-mono-num"
                                value={userId}
                                placeholder="例如 123456789"
                                onChange={(event) => setUserId(event.target.value)}
                            />
                        </Field>
                        <Field label="正文" hint="与群内「入典」记录的内容等价，只支持纯文字">
                            <Textarea
                                rows={4}
                                value={text}
                                placeholder="要记住的内容"
                                onChange={(event) => setText(event.target.value)}
                            />
                        </Field>
                    </div>
                    <div className="mt-5 flex items-center justify-end gap-2">
                        <Button onClick={onClose}>取消</Button>
                        <Button loading={saving} onClick={() => void submit()}>
                            保存
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function BlackHistoryPanel(): React.JSX.Element {
    const rows = useStore((s) => s.blackHistory);
    const loading = useStore((s) => s.groupDataLoading);
    const load = useStore((s) => s.loadGroupData);
    const removeRecords = useStore((s) => s.removeBlackRecords);
    const clearAll = useStore((s) => s.clearBlackHistory);
    const askConfirm = useStore((s) => s.askConfirm);
    const { profiles, groups, groupName, userName } = useNames();

    const [selected, setSelected] = useState(NO_GROUP);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<BlackRecordRow | null>(null);

    const sections = useMemo(
        () => buildSections(countByGroup(rows), profiles),
        [rows, profiles],
    );
    const active = pickActive(sections, selected);

    const activeRows = useMemo(
        () => rows.filter((row) => row.groupId === active),
        [rows, active],
    );

    const openCreate = (): void => {
        setEditing(null);
        setDialogOpen(true);
    };

    const openEdit = (row: BlackRecordRow): void => {
        setEditing(row);
        setDialogOpen(true);
    };

    const removeOne = async (row: BlackRecordRow): Promise<void> => {
        const body = row.text.length > 120 ? `${row.text.slice(0, 120)}…` : row.text;
        const ok = await askConfirm(
            `删除黑历史 #${row.id}`,
            `${userName(String(row.userId)) || row.userId}：${body}\n\n删除后无法恢复。`,
            'danger',
        );
        if (ok) await removeRecords([row.id]);
    };

    const clearAllRows = async (): Promise<void> => {
        const ok = await askConfirm(
            '清空黑历史',
            `将删除全部 ${rows.length} 条黑历史，删除后无法恢复。`,
            'danger',
        );
        if (ok) await clearAll();
    };

    const clearGroup = async (): Promise<void> => {
        const ids = activeRows.map((row) => row.id);
        const ok = await askConfirm(
            '清空该群黑历史',
            `将删除「${groupLabel(active, groupName)}」下的 ${ids.length} 条黑历史，删除后无法恢复。`,
            'danger',
        );
        if (ok) await removeRecords(ids);
    };

    return (
        <>
            <Panel>
                <PanelHeader
                    icon={<BookMarked className="size-4" />}
                    title="黑历史"
                    description="群内「入典」记录下来的内容，保存在 data/black_history.json；按群归档，可以手动新增 / 编辑 / 迁移。"
                    actions={
                        <>
                            <Button size="sm" onClick={openCreate}>
                                <Plus className="size-3.5" />
                                新增
                            </Button>
                            <Button size="sm" loading={loading} onClick={() => void load()}>
                                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                                刷新
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={!rows.length}
                                onClick={() => void clearAllRows()}
                            >
                                <Trash2 className="size-3.5" />
                                清空全部
                            </Button>
                        </>
                    }
                />

                {!rows.length ? (
                    <EmptyPanel text="还没有黑历史 —— 群内「入典」或点右上角新增。" />
                ) : (
                    <div className="flex min-h-[440px]">
                        <DataTree
                            sections={sections}
                            value={active}
                            onChange={setSelected}
                            groupName={groupName}
                            unit="条"
                        />

                        <div className="flex min-w-0 flex-1 flex-col">
                            <DetailHeader
                                groupId={active}
                                groupName={groupName}
                                summary={`${activeRows.length} 条`}
                                actions={
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        disabled={!activeRows.length}
                                        onClick={() => void clearGroup()}
                                    >
                                        <Trash2 className="size-3.5" />
                                        清空该群
                                    </Button>
                                }
                            />

                            <div className="max-h-[540px] overflow-auto">
                                {activeRows.map((row) => (
                                    <div
                                        key={row.id}
                                        className="flex items-center gap-3 border-b border-line/70 px-4 py-2.5 last:border-b-0"
                                    >
                                        <span className="w-[48px] shrink-0 font-mono-num text-[12px] text-subtle">
                                            #{row.id}
                                        </span>
                                        <IdentityCell
                                            kind="user"
                                            id={String(row.userId)}
                                            name={userName(String(row.userId))}
                                            className="w-[168px] shrink-0"
                                        />
                                        <span className="min-w-0 flex-1 text-left text-[12px] leading-5 break-all whitespace-pre-wrap text-ink-2">
                                            {row.text || '—'}
                                        </span>
                                        <div className="flex shrink-0 items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="iconSm"
                                                title="编辑 / 迁移到别的群"
                                                aria-label="编辑"
                                                onClick={() => openEdit(row)}
                                            >
                                                <Pencil className="size-3.5" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="iconSm"
                                                title="删除"
                                                aria-label="删除"
                                                onClick={() => void removeOne(row)}
                                            >
                                                <Trash2 className="size-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <SectionHint>
                                黑历史不跨群共享：每条只属于一个群。编号由插件自动分配，删除后不会复用；
                                编辑弹窗里改「所属群」即可把它迁移到别的群（含「未记录群」里的老数据）。
                            </SectionHint>
                        </div>
                    </div>
                )}
            </Panel>

            <BlackRecordDialog
                open={dialogOpen}
                record={editing}
                defaultGroupId={active}
                groups={groups}
                groupName={groupName}
                onClose={() => setDialogOpen(false)}
            />
        </>
    );
}

/* ---------------- 撤回记录 ---------------- */

function RecallUserRow({
    row,
    userName,
    onMigrate,
}: {
    row: RecallRow;
    userName: string;
    onMigrate: () => void;
}): React.JSX.Element {
    const remove = useStore((s) => s.removeRecallRow);
    const askConfirm = useStore((s) => s.askConfirm);
    const [open, setOpen] = useState(false);

    const removeRow = async (): Promise<void> => {
        const ok = await askConfirm(
            '删除撤回记录',
            `将删除 ${userName || row.userId}（${row.userId}）在群 ${row.groupId} 的全部 ${row.count} 条被撤回记录，删除后无法恢复。`,
            'danger',
        );
        if (ok) await remove(row.groupId, row.userId);
    };

    return (
        <div className="border-b border-line/70 last:border-b-0">
            <div className="flex items-center gap-3 px-4 py-2.5">
                <IdentityCell
                    kind="user"
                    id={row.userId}
                    name={userName}
                    className="w-[168px] shrink-0"
                />
                <Badge variant="strong">被撤回 {row.count} 次</Badge>
                <span className="font-mono-num text-[11px] text-subtle">
                    最近 {timeText(row.lastAt)}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                    <Button size="xs" variant="ghost" onClick={() => setOpen((value) => !value)}>
                        <ChevronDown
                            className={cn('size-3.5 transition-transform', open && 'rotate-180')}
                        />
                        {open ? '收起明细' : '查看明细'}
                    </Button>
                    <Button size="xs" variant="ghost" title="迁移到别的群" onClick={onMigrate}>
                        迁移
                    </Button>
                    <Button
                        variant="ghost"
                        size="iconSm"
                        className="size-7"
                        title="删除该成员的撤回记录"
                        aria-label="删除该成员的撤回记录"
                        onClick={() => void removeRow()}
                    >
                        <Trash2 className="size-3.5" />
                    </Button>
                </div>
            </div>

            {open ? (
                <ul className="space-y-1.5 border-t border-line/70 bg-surface-2/40 px-4 py-2.5">
                    {row.records.map((item, index) => (
                        <li
                            key={`${item.timestamp}-${index}`}
                            className="flex items-start gap-3 text-[12px]"
                        >
                            <span className="w-[32px] shrink-0 font-mono-num text-subtle">
                                #{index + 1}
                            </span>
                            <span className="w-[180px] shrink-0 truncate text-muted">
                                撤回人 {item.operatorName || item.operatorId}
                                <span className="font-mono-num text-subtle">
                                    {' '}
                                    ({item.operatorId})
                                </span>
                            </span>
                            <span className="w-[100px] shrink-0 font-mono-num text-[11px] text-subtle">
                                {timeText(item.timestamp)}
                            </span>
                            <span className="min-w-0 flex-1 leading-5 break-all whitespace-pre-wrap text-ink-2">
                                {item.message || '—'}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

function RecallRecordsPanel(): React.JSX.Element {
    const rows = useStore((s) => s.recallRecords);
    const loading = useStore((s) => s.groupDataLoading);
    const load = useStore((s) => s.loadGroupData);
    const clearRows = useStore((s) => s.clearRecallRows);
    const askConfirm = useStore((s) => s.askConfirm);
    const migrate = useStore((s) => s.migrateRecallRow);
    const { profiles, groups, groupName, userName } = useNames();

    const [selected, setSelected] = useState(NO_GROUP);
    const [migrating, setMigrating] = useState<RecallRow | null>(null);

    const sections = useMemo(
        () => buildSections(countByGroup(rows), profiles),
        [rows, profiles],
    );
    const active = pickActive(sections, selected);

    const activeRows = useMemo(
        () => rows.filter((row) => row.groupId === active),
        [rows, active],
    );

    const clearAll = async (): Promise<void> => {
        const ok = await askConfirm(
            '清空撤回记录',
            '将删除全部群的撤回记录，删除后无法恢复。',
            'danger',
        );
        if (ok) await clearRows();
    };

    const clearGroup = async (): Promise<void> => {
        const ok = await askConfirm(
            '清空该群撤回记录',
            `将删除群 ${active} 的 ${activeRows.length} 名成员的撤回记录。`,
            'danger',
        );
        if (ok) await clearRows(active);
    };

    return (
        <>
            <Panel>
                <PanelHeader
                    icon={<History className="size-4" />}
                    title="撤回记录"
                    description="管理员撤回他人消息时记录下来的内容，保存在 data/recall_records.json；这里只做查看、删除与迁移。"
                    actions={
                        <>
                            <Button size="sm" loading={loading} onClick={() => void load()}>
                                <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
                                刷新禁言记录
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={!rows.length}
                                onClick={() => void clearAll()}
                            >
                                <Trash2 className="size-3.5" />
                                清空全部
                            </Button>
                        </>
                    }
                />

                {!rows.length ? (
                    <EmptyPanel text="还没有撤回记录 —— 需要先在该群开启「撤回消息统计」。" />
                ) : (
                    <div className="flex min-h-[440px]">
                        <DataTree
                            sections={sections}
                            value={active}
                            onChange={setSelected}
                            groupName={groupName}
                            unit="人"
                        />

                        <div className="flex min-w-0 flex-1 flex-col">
                            <DetailHeader
                                groupId={active}
                                groupName={groupName}
                                summary={`${activeRows.length} 人 / ${activeRows.reduce(
                                    (sum, row) => sum + row.count,
                                    0,
                                )} 条`}
                                actions={
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        disabled={!activeRows.length}
                                        onClick={() => void clearGroup()}
                                    >
                                        <Trash2 className="size-3.5" />
                                        清空该群
                                    </Button>
                                }
                            />

                            <div className="max-h-[540px] overflow-auto">
                                {activeRows.map((row) => (
                                    <RecallUserRow
                                        key={`${row.groupId}-${row.userId}`}
                                        row={row}
                                        // 优先用记录里存下的群名片，老记录退回好友列表
                                        userName={row.userName || userName(row.userId)}
                                        onMigrate={() => setMigrating(row)}
                                    />
                                ))}
                            </div>

                            <SectionHint>
                                一条 = 某群某个被撤回消息的成员；展开可看每次撤回的撤回人与内容，迁移可把它挂到别的群下。
                                昵称来自记录时的反查，早期记录或反查失败时只显示号码。
                                内容是「消息到达时先缓存、撤回时取回」的 —— 撤回通知只带 message_id，
                                等通知到了消息已经被删、查不到正文，所以只有插件本次运行期间收到的消息才记得住；
                                取不到时显示「消息内容已不可获取」。
                            </SectionHint>
                        </div>
                    </div>
                )}
            </Panel>

            <MigrateDialog
                open={Boolean(migrating)}
                subject={
                    migrating
                        ? `${
                              migrating.userName || userName(migrating.userId) || migrating.userId
                          }（${migrating.userId}）的撤回记录`
                        : ''
                }
                fromGroupId={migrating?.groupId ?? ''}
                groups={groups}
                groupName={groupName}
                onConfirm={(target) =>
                    migrating
                        ? migrate(migrating.groupId, migrating.userId, target)
                        : Promise.resolve()
                }
                onClose={() => setMigrating(null)}
            />
        </>
    );
}

/* ---------------- 页面 ---------------- */

type DataTab = 'ban' | 'sm' | 'black' | 'blacklist' | 'recall';

/** 群数据：按「配置组 → 群」查看 / 管理插件运行中积累的群相关数据 */
export function GroupDataPage(): React.JSX.Element {
    const banRecords = useStore((s) => s.banRecords);
    const blackHistory = useStore((s) => s.blackHistory);
    const recallRecords = useStore((s) => s.recallRecords);
    const smStats = useStore((s) => s.smStats);
    const blacklist = useStore((s) => s.blacklist);
    const load = useStore((s) => s.loadGroupData);
    const loadSmStats = useStore((s) => s.loadSmStats);
    const loadBlacklist = useStore((s) => s.loadBlacklist);
    const [tab, setTab] = useState<DataTab>('ban');

    // 与概览页日志同样的节奏：进页面拉一次，之后每 5s 静默刷新一次。
    // 页面切走时组件会卸载，定时器跟着清掉；标签页在后台时跳过，免得白请求。
    useEffect(() => {
        void load();
        const id = window.setInterval(() => {
            if (document.hidden) return;
            void load({ silent: true });
        }, 5000);
        return () => window.clearInterval(id);
    }, [load]);

    // 禁言统计不参与上面的轮询（数据不会自己走动），只在进页面时拉一次，
    // 这样页签上的条数也是准的；页签里的「刷新」按钮可以再拉。
    useEffect(() => {
        void loadSmStats();
    }, [loadSmStats]);

    // 拉黑名单同理：只有群里执行 black / unblack 才会变，进页面拉一次即可
    useEffect(() => {
        void loadBlacklist();
    }, [loadBlacklist]);

    return (
        <div className="space-y-5">
            <Tabs
                items={[
                    { key: 'ban', label: '禁言记录', count: banRecords.length },
                    { key: 'sm', label: '禁言统计', count: smStats.length },
                    { key: 'black', label: '黑历史', count: blackHistory.length },
                    { key: 'blacklist', label: '拉黑名单', count: blacklist.length },
                    { key: 'recall', label: '撤回记录', count: recallRecords.length },
                ]}
                value={tab}
                onChange={(key) => setTab(key as DataTab)}
                className="rounded-panel border border-line bg-surface"
            />

            {tab === 'ban' ? <BanRecordsPanel /> : null}
            {tab === 'sm' ? <SmStatsPanel /> : null}
            {tab === 'black' ? <BlackHistoryPanel /> : null}
            {tab === 'blacklist' ? <BlacklistPanel /> : null}
            {tab === 'recall' ? <RecallRecordsPanel /> : null}
        </div>
    );
}

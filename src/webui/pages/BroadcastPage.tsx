import {
    Check,
    CircleCheck,
    MessageSquare,
    Search,
    Send,
    Trash2,
    TriangleAlert,
    Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialogShell } from '@/components/ui/dialog';
import { IdentityAvatar, IdentityCard, IdentityCell } from '@/components/ui/identity';
import { Input } from '@/components/ui/input';
import { RowField } from '@/components/ui/label';
import { Panel, PanelHeader, SectionTitle } from '@/components/ui/panel';
import { SwitchField } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/** 群间间隔上限（秒），与后端 GAP_LIMIT 保持一致 */
const GAP_LIMIT = 600;
/** 已选群最多渲染几个卡片，超出只报数，避免选了几百个群时页面被撑爆 */
const MAX_CHIPS = 24;
/** 预计耗时超过这个秒数时提示分批发送 */
const LONG_RUN = 240;

/** 间隔输入框：只留数字并限长，空字符串交给调用方回退默认值 */
function gapOf(raw: string, def: number): number {
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n)) return def;
    return Math.min(Math.max(n, 0), GAP_LIMIT);
}

function secondsText(seconds: number): string {
    if (seconds < 60) return `${Math.round(seconds)} 秒`;
    return `${Math.round(seconds / 60)} 分钟`;
}

export function BroadcastPage(): React.JSX.Element {
    const groups = useStore((s) => s.groups);
    const profiles = useStore((s) => s.profiles);
    const draft = useStore((s) => s.broadcastDraft);
    const patchBroadcast = useStore((s) => s.patchBroadcast);
    const sendBroadcast = useStore((s) => s.sendBroadcast);
    const broadcasting = useStore((s) => s.broadcasting);
    const result = useStore((s) => s.broadcastResult);
    const toast = useStore((s) => s.toast);

    /** 二次确认弹窗（要列群和正文，全局那个只吃字符串，所以页面自己渲染一个） */
    const [confirmOpen, setConfirmOpen] = useState(false);

    const { groups: selected, keyword, content, atAll, gapMin, gapMax } = draft;

    const filtered = useMemo(() => {
        const kw = keyword.trim().toLowerCase();
        if (!kw) return groups;
        return groups.filter(
            (group) =>
                String(group.group_id).includes(kw) ||
                (group.group_name || '').toLowerCase().includes(kw),
        );
    }, [groups, keyword]);

    const count = selected.length;
    const body = content.trim();

    const lo = Math.min(gapOf(gapMin, 1), gapOf(gapMax, 3));
    const hi = Math.max(gapOf(gapMin, 1), gapOf(gapMax, 3));

    // 第一条不等待，所以是 (群数 - 1) 段间隔，按平均间隔估算
    const estimate = Math.max(0, count - 1) * ((lo + hi) / 2);
    const preview = `${atAll ? '@全体成员 ' : ''}${body || '（正文）'}`;

    const allFilteredSelected =
        filtered.length > 0 && filtered.every((group) => selected.includes(String(group.group_id)));

    const nameOf = (gid: string): string =>
        groups.find((group) => String(group.group_id) === gid)?.group_name || '未知群';

    /** 群所在的「群配置」；归属以本地数据为准，正在编辑还没保存的绑定也能看到 */
    const profileLabelOf = (gid: string): string =>
        profiles.find((profile) => profile.group_ids.includes(gid))?.label ?? '';

    const toggle = (gid: string): void => {
        patchBroadcast({
            groups: selected.includes(gid)
                ? selected.filter((item) => item !== gid)
                : [...selected, gid],
        });
    };

    const selectFiltered = (): void => {
        const next = [...selected];
        filtered.forEach((group) => {
            const gid = String(group.group_id);
            if (!next.includes(gid)) next.push(gid);
        });
        patchBroadcast({ groups: next });
    };

    /** 点「发送」：先校验，再弹确认框（内容都在弹窗里，确认后才真的发） */
    const submit = (): void => {
        if (broadcasting) return;
        if (!count) {
            toast('请先勾选要发送的群', 'err');
            return;
        }
        if (!body) {
            toast('正文不能为空', 'err');
            return;
        }
        setConfirmOpen(true);
    };

    const sendNow = async (): Promise<void> => {
        // 先关弹窗：整轮可能跑几分钟，进度看页面上那个按钮的转圈
        setConfirmOpen(false);
        const data = await sendBroadcast({
            groups: selected,
            text: body,
            atAll,
            gapMin: lo,
            gapMax: hi,
        });
        if (!data) return;

        toast(
            data.failed.length
                ? `发送完成：成功 ${data.ok} / 失败 ${data.failed.length}`
                : `已发送到 ${data.ok} 个群`,
            data.failed.length ? 'err' : 'ok',
        );
    };

    return (
        <div className="space-y-5">
            <Panel>
                <PanelHeader
                    icon={<Users className="size-4" />}
                    title="选择群"
                    description="勾选任意数量的群，正文与 @ 对所有群都相同，逐个发送。"
                    actions={
                        <span className="text-xs text-subtle">
                            共 {groups.length} 个群 · 已选 {count} 个
                        </span>
                    }
                />
                <div className="space-y-4 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-[260px]">
                            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
                            <Input
                                className="pl-8"
                                value={keyword}
                                placeholder="搜索群号 / 群名"
                                onChange={(event) => patchBroadcast({ keyword: event.target.value })}
                            />
                        </div>
                        <Button
                            size="sm"
                            onClick={selectFiltered}
                            disabled={!filtered.length || allFilteredSelected}
                        >
                            <Check className="size-3.5" />
                            {keyword.trim() ? '全选筛选结果' : '全选'}
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => patchBroadcast({ groups: [] })}
                            disabled={!count}
                        >
                            <Trash2 className="size-3.5" />
                            清空
                        </Button>
                    </div>

                    {groups.length === 0 ? (
                        <p className="rounded-panel border border-dashed border-line px-4 py-6 text-center text-xs text-subtle">
                            还没有拉到群列表 —— 插件需要先收到一次群消息才会拉取。
                        </p>
                    ) : filtered.length === 0 ? (
                        <p className="rounded-panel border border-dashed border-line px-4 py-6 text-center text-xs text-subtle">
                            没有匹配「{keyword.trim()}」的群
                        </p>
                    ) : (
                        <div className="max-h-[300px] divide-y divide-line overflow-y-auto rounded-panel border border-line">
                            {filtered.map((group) => {
                                const gid = String(group.group_id);
                                const checked = selected.includes(gid);
                                const profileLabel = profileLabelOf(gid);
                                return (
                                    <button
                                        key={gid}
                                        type="button"
                                        aria-pressed={checked}
                                        onClick={() => toggle(gid)}
                                        className={cn(
                                            'flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-2',
                                            checked && 'bg-surface-2',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'grid size-4 shrink-0 place-items-center rounded-[4px] border',
                                                checked
                                                    ? 'border-inverse bg-inverse text-inverse-ink'
                                                    : 'border-line',
                                            )}
                                        >
                                            {checked ? <Check className="size-3" /> : null}
                                        </span>
                                        <IdentityAvatar kind="group" id={gid} />
                                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
                                            {group.group_name || '未命名群'}
                                        </span>
                                        {profileLabel ? (
                                            <Badge className="max-w-[160px]" title={profileLabel}>
                                                <span className="min-w-0 truncate">
                                                    {profileLabel}
                                                </span>
                                            </Badge>
                                        ) : (
                                            <Badge variant="dashed" title="这个群没有绑定任何配置">
                                                未绑定配置
                                            </Badge>
                                        )}
                                        <span className="shrink-0 font-mono-num text-[11px] text-subtle">
                                            {gid}
                                        </span>
                                        {group.member_count ? (
                                            <span className="w-[52px] shrink-0 text-right text-[11px] text-subtle">
                                                {group.member_count} 人
                                            </span>
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {count ? (
                        <div>
                            <SectionTitle count={count}>已选群</SectionTitle>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {selected.slice(0, MAX_CHIPS).map((gid) => (
                                    <IdentityCard
                                        key={gid}
                                        kind="group"
                                        id={gid}
                                        name={nameOf(gid)}
                                        onRemove={() => toggle(gid)}
                                    />
                                ))}
                                {count > MAX_CHIPS ? (
                                    <span className="self-center text-xs text-subtle">
                                        另有 {count - MAX_CHIPS} 个群
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            </Panel>

            <Panel>
                <PanelHeader
                    icon={<MessageSquare className="size-4" />}
                    title="消息内容"
                    description="本轮只支持纯文本与 @；图片等消息段后续再加。"
                />
                <div className="space-y-5 p-5">
                    <RowField label="正文" hint={`${body.length} 字`}>
                        <Textarea
                            className="min-h-[120px]"
                            value={content}
                            placeholder="输入要发送到各群的内容"
                            onChange={(event) => patchBroadcast({ content: event.target.value })}
                        />
                    </RowField>

                    <RowField label="@全体成员" hint="需要机器人在群里是管理员 / 群主">
                        <SwitchField
                            checked={atAll}
                            onCheckedChange={(checked) => patchBroadcast({ atAll: checked })}
                            label={atAll ? '每条消息都 @全体成员' : '不 @ 全体成员'}
                            description="开启后所有群的消息都会带上 @全体成员，注意打扰"
                        />
                    </RowField>

                    <RowField label="发送效果">
                        <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
                            {preview}
                        </p>
                    </RowField>
                </div>
            </Panel>

            <Panel>
                <PanelHeader
                    icon={<Send className="size-4" />}
                    title="发送"
                    description="两次发送之间随机等待一段时间，避免短时间内连发被风控；0 表示不等待。"
                />
                <div className="space-y-5 p-5">
                    <RowField label="群间随机间隔">
                        <div className="flex items-center gap-2">
                            <Input
                                className="w-[110px] font-mono-num"
                                value={gapMin}
                                inputMode="numeric"
                                onChange={(event) =>
                                    patchBroadcast({
                                        gapMin: event.target.value.replace(/[^\d]/g, '').slice(0, 3),
                                    })
                                }
                            />
                            <span className="text-xs text-subtle">~</span>
                            <Input
                                className="w-[110px] font-mono-num"
                                value={gapMax}
                                inputMode="numeric"
                                onChange={(event) =>
                                    patchBroadcast({
                                        gapMax: event.target.value.replace(/[^\d]/g, '').slice(0, 3),
                                    })
                                }
                            />
                            <span className="text-xs text-subtle">秒（最大 {GAP_LIMIT}）</span>
                        </div>
                    </RowField>

                    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                        <Button
                            variant="primary"
                            loading={broadcasting}
                            disabled={!count || !body}
                            onClick={() => void submit()}
                        >
                            <Send className="size-3.5" />
                            {broadcasting ? '发送中…' : `发送到 ${count} 个群`}
                        </Button>
                        <span className="text-xs text-subtle">
                            {count
                                ? `随机间隔 ${lo} ~ ${hi} 秒，预计耗时约 ${secondsText(estimate)}`
                                : '先在上方勾选要发送的群'}
                        </span>
                    </div>

                    {estimate > LONG_RUN ? (
                        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
                            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                            这一轮预计要跑 {secondsText(estimate)}，期间请勿关闭页面；
                            群数较多时建议分批发送，避免请求被提前断开。
                        </p>
                    ) : null}

                    {result ? (
                        <div className="rounded-panel border border-line bg-surface-2 p-4">
                            <div className="flex items-center gap-2 text-[13px] text-ink">
                                {result.failed.length ? (
                                    <TriangleAlert className="size-4 shrink-0" />
                                ) : (
                                    <CircleCheck className="size-4 shrink-0" />
                                )}
                                发送完成：成功 {result.ok} / {result.total} 个群
                            </div>
                            {result.failed.length ? (
                                <ul className="mt-2 space-y-1">
                                    {result.failed.map((item) => (
                                        <li
                                            key={item.groupId}
                                            className="flex items-start gap-2 text-[12px] leading-relaxed"
                                        >
                                            <IdentityAvatar
                                                kind="group"
                                                id={item.groupId}
                                                className="mt-[1px] size-5"
                                            />
                                            <span className="shrink-0 text-ink-2">
                                                {nameOf(item.groupId)}
                                            </span>
                                            <span className="min-w-0 flex-1 break-all text-subtle">
                                                {item.error}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </Panel>

            <ConfirmDialogShell
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="确认发送"
                description={
                    `群间随机间隔 ${lo} ~ ${hi} 秒，预计耗时约 ${secondsText(estimate)}。\n` +
                    '消息发出后无法撤回，请确认群与内容无误。'
                }
                confirmText={`发送到 ${count} 个群`}
                onConfirm={() => void sendNow()}
            >
                <div className="max-h-[320px] space-y-3 overflow-y-auto">
                    <div className="rounded-panel border border-line bg-surface-2 p-3">
                        <div className="text-[11px] text-subtle">消息内容</div>
                        <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink-2">
                            {preview}
                        </p>
                    </div>

                    <div className="overflow-hidden rounded-panel border border-line">
                        <div className="border-b border-line bg-surface-2 px-3 py-1.5 text-[11px] text-subtle">
                            将发送到 {count} 个群
                        </div>
                        <div className="max-h-[200px] divide-y divide-line overflow-y-auto">
                            {selected.map((gid) => (
                                <div key={gid} className="flex items-center gap-2 px-3 py-2">
                                    <IdentityCell
                                        kind="group"
                                        id={gid}
                                        name={nameOf(gid)}
                                        className="min-w-0 flex-1"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </ConfirmDialogShell>
        </div>
    );
}

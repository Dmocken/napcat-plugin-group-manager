import { Check, ChevronDown, KeyRound, Plus, Power, RotateCcw, Search, Terminal, UsersRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import { DupCheckPanel } from '@/components/DupCheckPanel';
import { Button } from '@/components/ui/button';
import { IdentityAvatar, IdentityCard } from '@/components/ui/identity';
import { Input } from '@/components/ui/input';
import { RowField } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SwitchField } from '@/components/ui/switch';
import { TEXT_FIELDS } from '@/lib/constants';
import type { FriendInfo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/** 好友下拉一次最多渲染的行数（好友过多时避免卡顿，靠搜索继续过滤） */
const MAX_FRIEND_ROWS = 200;

/** 好友展示名：备注优先于昵称 */
function friendName(friend: FriendInfo): string {
    return friend.remark || friend.nickname || '';
}

export function GlobalSettingsPage(): React.JSX.Element {
    const global = useStore((s) => s.global);
    const friends = useStore((s) => s.friends);
    const patchGlobal = useStore((s) => s.patchGlobal);
    const setText = useStore((s) => s.setText);
    const addAdmin = useStore((s) => s.addAdmin);
    const removeAdmin = useStore((s) => s.removeAdmin);
    const toast = useStore((s) => s.toast);

    const [adminDraft, setAdminDraft] = useState('');
    const [friendOpen, setFriendOpen] = useState(false);
    const [friendKeyword, setFriendKeyword] = useState('');
    const admins = global.global_admins ?? [];

    const filteredFriends = useMemo(() => {
        const kw = friendKeyword.trim().toLowerCase();
        if (!kw) return friends;
        return friends.filter(
            (friend) =>
                friend.user_id.includes(kw) ||
                (friend.nickname || '').toLowerCase().includes(kw) ||
                (friend.remark || '').toLowerCase().includes(kw),
        );
    }, [friends, friendKeyword]);

    const shownFriends = filteredFriends.slice(0, MAX_FRIEND_ROWS);

    const submitAdmin = (): void => {
        const value = adminDraft.trim();
        if (!value) return;
        addAdmin(value);
        setAdminDraft('');
    };

    const friendOf = (qq: string): FriendInfo | undefined =>
        friends.find((friend) => friend.user_id === qq);

    return (
        <div className="space-y-5">
            <Panel>
                <PanelHeader
                    icon={<Power className="size-4" />}
                    title="运行参数"
                    description="关闭总开关后所有功能立即失效，配置不会被删除。"
                />
                <div className="space-y-5 p-5">
                    <RowField label="插件总开关">
                        <SwitchField
                            checked={global.enabled !== false}
                            onCheckedChange={(checked) => patchGlobal({ enabled: checked })}
                            label={global.enabled !== false ? '已启用' : '已停用'}
                            description="总开关打开时，下面每个群配置里的功能开关才会实际生效。"
                        />
                    </RowField>
                    <RowField label="命令前缀" hint="仅影响本插件解析的指令">
                        <div className="flex items-center gap-3">
                            <div className="relative w-[140px]">
                                <Terminal className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
                                <Input
                                    className="pl-8"
                                    value={global.command_prefix ?? '/'}
                                    onChange={(event) =>
                                        patchGlobal({ command_prefix: event.target.value })
                                    }
                                />
                            </div>
                            <span className="font-mono-num text-xs text-subtle">
                                例：{global.command_prefix || '/'}mute @用户 600
                            </span>
                        </div>
                    </RowField>
                    <RowField label="调试日志" hint="排查问题时可临时打开">
                        <SwitchField
                            checked={global.debug === true}
                            onCheckedChange={(checked) => patchGlobal({ debug: checked })}
                            label={global.debug === true ? '输出调试日志' : '不输出'}
                        />
                    </RowField>
                </div>
            </Panel>

            <DupCheckPanel />

            <Panel>
                <PanelHeader
                    icon={<KeyRound className="size-4" />}
                    title="Bot 管理员"
                    description="拥有全部群、全部功能的最高权限，不受任何名单与开关限制。"
                />
                <div className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            className="w-[240px]"
                            value={adminDraft}
                            placeholder="输入 QQ 号后回车添加"
                            onChange={(event) => setAdminDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    submitAdmin();
                                }
                            }}
                        />
                        <Button
                            onClick={() => {
                                if (!adminDraft.trim()) {
                                    toast('请先输入 QQ 号', 'err');
                                    return;
                                }
                                submitAdmin();
                            }}
                        >
                            <Plus className="size-3.5" />
                            添加
                        </Button>

                        <Popover open={friendOpen} onOpenChange={setFriendOpen}>
                            <PopoverTrigger asChild>
                                <Button title="从 Bot 好友列表里挑选">
                                    <UsersRound className="size-3.5" />
                                    从好友选择
                                    <ChevronDown
                                        className={cn(
                                            'size-3.5 text-subtle transition-transform',
                                            friendOpen && 'rotate-180',
                                        )}
                                    />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent width={360}>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
                                    <Input
                                        className="pl-8"
                                        value={friendKeyword}
                                        placeholder="搜索好友昵称 / QQ 号"
                                        onChange={(event) => setFriendKeyword(event.target.value)}
                                    />
                                </div>

                                <div className="mt-2 max-h-[300px] overflow-auto">
                                    {shownFriends.length === 0 ? (
                                        <p className="px-1 py-3 text-xs text-subtle">
                                            {friends.length
                                                ? '没有匹配的好友'
                                                : '没有拉到好友列表，可直接输入 QQ 号添加'}
                                        </p>
                                    ) : (
                                        shownFriends.map((friend) => {
                                            const added = admins.includes(friend.user_id);
                                            return (
                                                <button
                                                    key={friend.user_id}
                                                    type="button"
                                                    disabled={added}
                                                    onClick={() => addAdmin(friend.user_id)}
                                                    className={cn(
                                                        'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors',
                                                        added
                                                            ? 'cursor-default opacity-60'
                                                            : 'cursor-pointer hover:bg-surface-3',
                                                    )}
                                                >
                                                    <IdentityAvatar
                                                        kind="user"
                                                        id={friend.user_id}
                                                    />
                                                    <span className="flex min-w-0 flex-1 flex-col">
                                                        <span className="truncate text-[12px] leading-4 text-ink-2">
                                                            {friendName(friend) ||
                                                                friend.user_id}
                                                        </span>
                                                        <span className="truncate font-mono-num text-[10px] leading-4 text-subtle">
                                                            {friend.user_id}
                                                        </span>
                                                    </span>
                                                    {added ? (
                                                        <Check className="size-3.5 shrink-0 text-subtle" />
                                                    ) : (
                                                        <Plus className="size-3.5 shrink-0 text-subtle" />
                                                    )}
                                                </button>
                                            );
                                        })
                                    )}
                                    {filteredFriends.length > shownFriends.length ? (
                                        <p className="px-2 py-2 text-[11px] text-subtle">
                                            仅显示前 {MAX_FRIEND_ROWS} 位，输入关键字继续筛选
                                        </p>
                                    ) : null}
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                        {admins.length === 0 ? (
                            <p className="text-xs text-subtle">
                                还没有设置管理员 —— 此时只有各群配置里的「成员名单」成员能使用功能。
                            </p>
                        ) : (
                            admins.map((qq, index) => {
                                const friend = friendOf(qq);
                                return (
                                    <IdentityCard
                                        key={`${qq}-${index}`}
                                        kind="user"
                                        id={qq}
                                        name={friend ? friendName(friend) : ''}
                                        onRemove={() => removeAdmin(index)}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            </Panel>

            <Panel>
                <PanelHeader
                    title="通用提示文案"
                    description="无权限、仅群聊等通用回复的覆盖文案；留空即使用内置默认值。这些文案不支持占位符，会按原样发送。"
                />
                <div className="grid grid-cols-2 gap-x-5 gap-y-4 p-5">
                    {TEXT_FIELDS.map((field) => {
                        const value = global.texts?.[field.key] ?? '';
                        return (
                            <div key={field.key} className="flex flex-col gap-1.5">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-[13px] text-ink-2">{field.label}</span>
                                    {value ? (
                                        <Button
                                            variant="underline"
                                            onClick={() => setText(field.key, '')}
                                            title="恢复为内置默认文案"
                                        >
                                            <RotateCcw className="size-3" />
                                            恢复默认
                                        </Button>
                                    ) : null}
                                </div>
                                <Input
                                    value={value}
                                    placeholder={`默认：${field.fallback}`}
                                    onChange={(event) => setText(field.key, event.target.value)}
                                />
                                <span className="text-xs text-subtle">默认：{field.fallback}</span>
                            </div>
                        );
                    })}
                </div>
                <p className="border-t border-line px-5 py-3 text-[11px] text-subtle">
                    各功能自己的提示（禁言成功、格式错误、加群拒绝理由等）在「群配置 → 提示文案」页里按功能修改。
                </p>
            </Panel>
        </div>
    );
}

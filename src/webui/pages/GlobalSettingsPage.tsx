import { KeyRound, Plus, Power, RotateCcw, Terminal } from 'lucide-react';
import { useState } from 'react';

import { DupCheckPanel } from '@/components/DupCheckPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RowField } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { SwitchField } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { TEXT_FIELDS } from '@/lib/constants';
import { useStore } from '@/store';

export function GlobalSettingsPage(): React.JSX.Element {
    const global = useStore((s) => s.global);
    const patchGlobal = useStore((s) => s.patchGlobal);
    const setText = useStore((s) => s.setText);
    const addAdmin = useStore((s) => s.addAdmin);
    const removeAdmin = useStore((s) => s.removeAdmin);
    const toast = useStore((s) => s.toast);

    const [adminDraft, setAdminDraft] = useState('');
    const admins = global.global_admins ?? [];

    const submitAdmin = (): void => {
        const value = adminDraft.trim();
        if (!value) return;
        addAdmin(value);
        setAdminDraft('');
    };

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
                    <div className="flex items-center gap-2">
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
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {admins.length === 0 ? (
                            <p className="text-xs text-subtle">
                                还没有设置管理员 —— 此时只有各群配置里的「成员名单」成员能使用功能。
                            </p>
                        ) : (
                            admins.map((qq, index) => (
                                <Tag
                                    key={`${qq}-${index}`}
                                    variant="solid"
                                    onRemove={() => removeAdmin(index)}
                                >
                                    {qq}
                                </Tag>
                            ))
                        )}
                    </div>
                </div>
            </Panel>

            <Panel>
                <PanelHeader
                    title="通用提示文案"
                    description="无权限、仅群聊等通用回复的覆盖文案；留空即使用内置默认值。"
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
import { ChevronRight, GripVertical, Terminal } from 'lucide-react';

import { ParamsSection } from '@/components/ParamField';
import { ParamField } from '@/components/profile/ParamField';
import { TagListEditor } from '@/components/TagListEditor';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SectionTitle } from '@/components/ui/panel';
import { Switch, SwitchField } from '@/components/ui/switch';
import { featureIcon } from '@/lib/constants';
import { featureSummary } from '@/lib/profile';
import type { FeatureMeta, GroupProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

interface FeatureRowProps {
    profile: GroupProfile;
    meta: FeatureMeta;
    draggingKey: string | null;
    dropKey: string | null;
    onDragStart: (key: string) => void;
    onDragEnd: () => void;
    setDropKey: (key: string | null) => void;
    onDropOn: (key: string) => void;
}

/** 单个功能 → 一行可折叠的列表项（拖动手柄排序，右侧直接开关） */
export function FeatureRow({
    profile,
    meta,
    draggingKey,
    dropKey,
    onDragStart,
    onDragEnd,
    setDropKey,
    onDropOn,
}: FeatureRowProps): React.JSX.Element | null {
    const storeKey = `${profile.id}|${meta.key}`;
    // 默认收起：只有显式点开过才展开
    const collapsed = useStore((s) => s.collapsed[storeKey] ?? true);
    const setCollapsed = useStore((s) => s.setCollapsed);
    const updateFeature = useStore((s) => s.updateFeature);

    const settings = profile.features[meta.key];
    if (!settings) return null;

    const Icon = featureIcon(meta.key);
    const permissionParams = (meta.params ?? []).filter((p) => p.slot === 'permission');
    const dragging = draggingKey === meta.key;
    const isDropTarget = dropKey === meta.key && draggingKey !== null && draggingKey !== meta.key;

    return (
        <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(storeKey, !open)} asChild>
            <div
                className={cn(
                    'border-b border-line transition-colors last:border-b-0',
                    dragging && 'opacity-40',
                    isDropTarget && 'bg-surface-3',
                )}
                onDragOver={(event) => {
                    if (!draggingKey || draggingKey === meta.key) return;
                    event.preventDefault();
                    setDropKey(meta.key);
                }}
                onDragLeave={() => setDropKey(null)}
                onDrop={(event) => {
                    event.preventDefault();
                    onDropOn(meta.key);
                }}
            >
                <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2">
                        <span
                            draggable
                            onDragStart={(event) => {
                                if (event.dataTransfer) {
                                    event.dataTransfer.effectAllowed = 'move';
                                    try {
                                        event.dataTransfer.setData('text/plain', meta.key);
                                    } catch {
                                        /* 某些环境禁用 dataTransfer */
                                    }
                                }
                                onDragStart(meta.key);
                            }}
                            onDragEnd={onDragEnd}
                            title="拖动可调整顺序"
                            className="grid size-5 shrink-0 cursor-grab place-items-center text-subtle active:cursor-grabbing"
                        >
                            <GripVertical className="size-3.5" />
                        </span>

                        <Icon
                            className={cn(
                                'size-4 shrink-0',
                                settings.enabled ? 'text-ink' : 'text-subtle',
                            )}
                        />

                        <span
                            className={cn(
                                'shrink-0 text-[13px] font-medium',
                                settings.enabled ? 'text-ink' : 'text-muted',
                            )}
                        >
                            {meta.label}
                        </span>
                        {!meta.implemented ? <Badge variant="dashed">开发中</Badge> : null}

                        <span className="ml-2 min-w-0 flex-1 truncate text-xs text-subtle">
                            {featureSummary(meta, settings)}
                        </span>

                        <Switch
                            className="shrink-0"
                            checked={settings.enabled}
                            onClick={(event) => event.stopPropagation()}
                            onCheckedChange={(checked) =>
                                updateFeature(profile.id, meta.key, (draft) => {
                                    draft.enabled = checked;
                                })
                            }
                        />
                        <ChevronRight
                            className={cn(
                                'size-3.5 shrink-0 text-subtle transition-transform',
                                !collapsed && 'rotate-90',
                            )}
                        />
                    </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <div className="space-y-4 border-t border-line bg-canvas/40 px-3 py-4">
                        {meta.usage ? (
                            <div className="flex items-start gap-2 rounded-control border border-line bg-surface-2 px-3 py-2">
                                <Terminal className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                                <pre className="font-mono-num text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
                                    {meta.usage}
                                </pre>
                            </div>
                        ) : null}
                        <div>
                            <SectionTitle>使用权限</SectionTitle>
                            <div className="mt-2 space-y-2.5">
                                {permissionParams.map((param) => (
                                    <ParamField
                                        key={param.key}
                                        param={param}
                                        value={settings.params[param.key]}
                                        onChange={(value) =>
                                            updateFeature(profile.id, meta.key, (draft) => {
                                                draft.params[param.key] = value;
                                            })
                                        }
                                    />
                                ))}
                                <SwitchField
                                    checked={settings.allow_group_admin}
                                    onCheckedChange={(checked) =>
                                        updateFeature(profile.id, meta.key, (draft) => {
                                            draft.allow_group_admin = checked;
                                        })
                                    }
                                    label="允许群主 / 管理员使用"
                                />
                                <div>
                                    <div className="mb-1.5 text-xs text-subtle">
                                        成员名单（名单内成员始终可用，不受上面开关影响）
                                    </div>
                                    <TagListEditor
                                        list={settings.allowed_users}
                                        onChange={(next) =>
                                            updateFeature(profile.id, meta.key, (draft) => {
                                                draft.allowed_users = next;
                                            })
                                        }
                                        placeholder="QQ 号，回车添加，可用空格或逗号批量添加"
                                        inputWidth={300}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <SectionTitle>参数</SectionTitle>
                            <div className="mt-2.5">
                                <ParamsSection
                                    meta={meta}
                                    settings={settings}
                                    profileId={profile.id}
                                />
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}
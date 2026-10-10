import { ChevronsDownUp, ChevronsUpDown, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { GroupSelect } from '@/components/GroupSelect';
import { FeatureRow } from '@/components/profile/FeatureRow';
import { TextRow } from '@/components/profile/TextRow';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Panel, SectionTitle } from '@/components/ui/panel';
import { Tabs } from '@/components/ui/tabs';
import { featureOrder, profileImpact, textParamsOf } from '@/lib/profile';
import type { GroupProfile } from '@/lib/types';
import { useStore } from '@/store';

type TabKey = 'features' | 'groups' | 'texts';

/** 单条群配置的详情：头部信息 + 功能 / 绑定群 / 提示文案三个页签 */
export function ProfileDetail({
    profile,
    index,
}: {
    profile: GroupProfile;
    index: number;
}): React.JSX.Element {
    const meta = useStore((s) => s.meta);
    const collapsed = useStore((s) => s.collapsed);
    const setProfileLabel = useStore((s) => s.setProfileLabel);
    const removeProfile = useStore((s) => s.removeProfile);
    const setProfileCollapsedAll = useStore((s) => s.setProfileCollapsedAll);
    const reorderFeature = useStore((s) => s.reorderFeature);
    const askConfirm = useStore((s) => s.askConfirm);
    const toast = useStore((s) => s.toast);

    const [tab, setTab] = useState<TabKey>('groups');
    const [draggingKey, setDraggingKey] = useState<string | null>(null);
    const [dropKey, setDropKey] = useState<string | null>(null);

    const metaByKey = useMemo(
        () => new Map((meta?.features ?? []).map((feature) => [feature.key, feature])),
        [meta],
    );

    if (!meta) return <div />;

    const order = featureOrder(profile, meta.features);
    // 「展开全部」按当前页签判断：功能页看功能行，文案页看文案行
    const collapsePrefix = tab === 'texts' ? 'text|' : '';
    const allOpen = meta.features.every(
        (feature) => !(collapsed[`${collapsePrefix}${profile.id}|${feature.key}`] ?? true),
    );
    const impact = profileImpact(profile);
    const enabledCount = Object.values(profile.features).filter((f) => f.enabled).length;
    const textCount = meta.features.reduce((sum, f) => sum + textParamsOf(f).length, 0);

    const handleDelete = async (): Promise<void> => {
        const ok = await askConfirm(
            '删除群配置',
            `确定删除「${profile.label}」？\n该配置绑定了 ${impact.groups} 个群、启用了 ${impact.features} 个功能，` +
                `名单中还有 ${impact.users} 位成员。删除后这些群将不再受本插件管控，保存后生效。`,
            'danger',
        );
        if (ok) {
            removeProfile(profile.id);
            toast('已删除，保存后生效');
        }
    };

    const handleDrop = (targetKey: string): void => {
        if (!draggingKey || draggingKey === targetKey) {
            setDraggingKey(null);
            setDropKey(null);
            return;
        }
        reorderFeature(profile.id, draggingKey, targetKey);
        setDraggingKey(null);
        setDropKey(null);
        toast(`已调整「${metaByKey.get(targetKey)?.label ?? targetKey}」的位置，保存后生效`);
    };

    return (
        <Panel className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
                <Input
                    className="h-8 max-w-[280px] border-transparent bg-transparent px-2 text-[15px] font-semibold hover:border-line focus:border-ink-2"
                    value={profile.label}
                    placeholder="配置名称"
                    onChange={(event) => setProfileLabel(profile.id, event.target.value)}
                />
                <Badge variant="strong">#{index + 1}</Badge>
                <Badge>{profile.group_ids.length} 个群</Badge>
                <Badge variant={enabledCount ? 'default' : 'dashed'}>
                    启用 {enabledCount} / {meta.features.length}
                </Badge>
                <span className="flex-1" />
                {tab === 'groups' ? null : (
                    <Button
                        size="sm"
                        onClick={() =>
                            setProfileCollapsedAll(
                                profile.id,
                                allOpen,
                                tab === 'texts' ? 'texts' : 'features',
                            )
                        }
                        title={tab === 'texts' ? '折叠 / 展开全部文案分组' : '折叠 / 展开全部功能'}
                    >
                        {allOpen ? (
                            <ChevronsDownUp className="size-3.5" />
                        ) : (
                            <ChevronsUpDown className="size-3.5" />
                        )}
                        {allOpen ? '收起全部' : '展开全部'}
                    </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => void handleDelete()} title="删除这条配置">
                    <Trash2 className="size-3.5" />
                    删除
                </Button>
            </div>

            <Tabs
                className="shrink-0"
                value={tab}
                onChange={(key) => setTab(key as TabKey)}
                items={[
                    { key: 'groups', label: '绑定群', count: profile.group_ids.length },
                    { key: 'features', label: '功能', count: order.length },
                    { key: 'texts', label: '提示文案', count: textCount },
                ]}
            />

            <div className="min-h-0 flex-1 overflow-y-auto">
                {tab === 'features' ? (
                    <div>
                        <div className="border-b border-line bg-surface-2/60 px-5 py-2 text-[11px] text-subtle">
                            拖动左侧手柄可调整功能顺序；在行尾直接开关功能，展开后配置权限与参数。
                        </div>
                        {order.map((key) => {
                            const feature = metaByKey.get(key);
                            if (!feature) return null;
                            return (
                                <FeatureRow
                                    key={key}
                                    profile={profile}
                                    meta={feature}
                                    draggingKey={draggingKey}
                                    dropKey={dropKey}
                                    onDragStart={setDraggingKey}
                                    onDragEnd={() => {
                                        setDraggingKey(null);
                                        setDropKey(null);
                                    }}
                                    setDropKey={setDropKey}
                                    onDropOn={handleDrop}
                                />
                            );
                        })}
                    </div>
                ) : null}

                {tab === 'groups' ? (
                    <div className="space-y-4 p-5">
                        <div>
                            <SectionTitle count={profile.group_ids.length}>绑定群</SectionTitle>
                            <p className="mt-1 text-xs text-subtle">
                                一个群只能出现在一条配置里；把功能配置相同的群放进同一条配置即可一次配置多个群。
                            </p>
                        </div>
                        <GroupSelect profile={profile} />
                    </div>
                ) : null}

                {tab === 'texts' ? (
                    <div className="p-5">
                        <p className="mb-3 text-xs text-subtle">
                            按功能集中修改提示文案（功能开关、参数在「功能」页里改）；留空即使用内置默认值。
                        </p>
                        <div className="overflow-hidden rounded-panel border border-line">
                            {order.map((key) => {
                                const feature = metaByKey.get(key);
                                if (!feature) return null;
                                return <TextRow key={key} profile={profile} meta={feature} />;
                            })}
                        </div>
                    </div>
                ) : null}
            </div>
        </Panel>
    );
}
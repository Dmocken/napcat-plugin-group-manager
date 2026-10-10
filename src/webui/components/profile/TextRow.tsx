import { ChevronRight } from 'lucide-react';

import { ParamField } from '@/components/profile/ParamField';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { featureIcon } from '@/lib/constants';
import { textParamsOf } from '@/lib/profile';
import type { FeatureMeta, GroupProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/** 提示文案页签里的一行：按功能折叠，展开后集中改这个功能的全部文案 */
export function TextRow({
    profile,
    meta,
}: {
    profile: GroupProfile;
    meta: FeatureMeta;
}): React.JSX.Element | null {
    const settings = profile.features[meta.key];
    const params = textParamsOf(meta);
    const updateFeature = useStore((s) => s.updateFeature);

    const storeKey = `text|${profile.id}|${meta.key}`;
    const collapsed = useStore((s) => s.collapsed[storeKey] ?? true);
    const setCollapsed = useStore((s) => s.setCollapsed);

    if (!settings || !params.length) return null;

    const Icon = featureIcon(meta.key);

    return (
        <Collapsible open={!collapsed} onOpenChange={(open) => setCollapsed(storeKey, !open)} asChild>
            <div className="border-b border-line last:border-b-0">
                <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-2.5 px-5 py-2.5 transition-colors hover:bg-surface-2">
                        <Icon className="size-4 shrink-0 text-subtle" />
                        <span className="shrink-0 text-[13px] font-medium text-ink-2">
                            {meta.label}
                        </span>
                        <span className="shrink-0 text-[11px] text-subtle">{params.length} 项文案</span>
                        <ChevronRight
                            className={cn(
                                'ml-auto size-3.5 shrink-0 text-subtle transition-transform',
                                !collapsed && 'rotate-90',
                            )}
                        />
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-line bg-canvas/40 px-5 py-4">
                        {params.map((param) => (
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
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}
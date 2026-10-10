import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { FeatureActions } from '@/components/FeatureActions';
import { ParamField } from '@/components/profile/ParamField';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { TEXT_GROUP } from '@/lib/constants';
import type { FeatureMeta, FeatureSettings, ParamMeta } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/** 参数区：按 group 分组；提示文案那一组统一挪到「提示文案」页签，这里不重复展示 */
export function ParamsSection({
    meta,
    settings,
    profileId,
}: {
    meta: FeatureMeta;
    settings: FeatureSettings;
    profileId: string;
}): React.JSX.Element | null {
    const updateFeature = useStore((s) => s.updateFeature);
    const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

    const groups = useMemo(() => {
        const result: { name: string; params: ParamMeta[] }[] = [];
        (meta.params ?? [])
            .filter((param) => param.group !== TEXT_GROUP && param.slot !== 'permission')
            .forEach((param) => {
                const name = param.group || '参数';
                let group = result.find((item) => item.name === name);
                if (!group) {
                    group = { name, params: [] };
                    result.push(group);
                }
                group.params.push(param);
            });
        return result;
    }, [meta.params]);

    const hasActions = Boolean(meta.actions?.length);
    /** 操作按钮是否落在某个参数分组内（否则回退到参数区底部） */
    const actionsInGroup = Boolean(
        hasActions && meta.actionGroup && groups.some((g) => g.name === meta.actionGroup),
    );
    if (!groups.length && !hasActions) return null;

    const setParam = (key: string, value: unknown): void => {
        updateFeature(profileId, meta.key, (draft) => {
            draft.params[key] = value;
        });
    };

    const renderGrid = (params: ParamMeta[]): React.JSX.Element => (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            {params.map((param) => (
                <ParamField
                    key={param.key}
                    param={param}
                    value={settings.params[param.key]}
                    onChange={(value) => setParam(param.key, value)}
                />
            ))}
        </div>
    );

    return (
        <div className="space-y-3">
            {groups.length === 1
                ? renderGrid(groups[0].params)
                : groups.map((group) => {
                      const open = openMap[group.name] ?? true;
                      return (
                          <Collapsible
                              key={group.name}
                              open={open}
                              onOpenChange={(next) =>
                                  setOpenMap((prev) => ({ ...prev, [group.name]: next }))
                              }
                              className="overflow-hidden rounded-control border border-line"
                          >
                              <CollapsibleTrigger asChild>
                                  <button
                                      type="button"
                                      className="flex w-full cursor-pointer items-center gap-2 bg-surface-2 px-3 py-2 text-left text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-3"
                                  >
                                      <ChevronRight
                                          className={cn(
                                              'size-3.5 text-subtle transition-transform',
                                              open && 'rotate-90',
                                          )}
                                      />
                                      {group.name}
                                      <span className="text-[11px] font-normal text-subtle">
                                          {group.params.length} 项
                                      </span>
                                  </button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                  <div className="space-y-3 p-3.5">
                                      {renderGrid(group.params)}
                                      {group.name === meta.actionGroup && hasActions ? (
                                          <FeatureActions meta={meta} settings={settings} />
                                      ) : null}
                                  </div>
                              </CollapsibleContent>
                          </Collapsible>
                      );
                  })}

            {hasActions && !actionsInGroup ? <FeatureActions meta={meta} settings={settings} /> : null}
        </div>
    );
}
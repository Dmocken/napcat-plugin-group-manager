import { GroupPicker } from '@/components/GroupPicker';
import { TagListEditor } from '@/components/TagListEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    const extraGroupIds = useStore((s) => s.dupSnapshot?.groupIds);
    const list = Array.isArray(value) ? value.map(String) : [];

    return (
        <GroupPicker
            selected={list}
            onChange={(next) => onChange(next)}
            extraGroupIds={extraGroupIds}
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
                (param.type === 'wordlists' || param.type === 'grouplist') && 'col-span-full',
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
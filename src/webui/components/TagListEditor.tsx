import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag } from '@/components/ui/tag';
import { DEFAULT_SPLITTER } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

interface TagListEditorProps {
    list: string[];
    /** 提交新的完整列表（保持不可变） */
    onChange: (next: string[]) => void;
    placeholder?: string;
    inputWidth?: number;
    /** 批量分隔正则 */
    splitter?: RegExp;
    /** 标签区是否限高滚动 */
    scroll?: boolean;
    /** 自定义标签展示文案 */
    itemLabel?: (value: string) => string;
    emptyText?: string;
    onCount?: (count: number) => void;
    className?: string;
}

/** 胶囊列表编辑器：输入框 + 添加按钮，已添加项以胶囊展示（点 × 删除） */
export function TagListEditor({
    list,
    onChange,
    placeholder = '输入后回车添加，可用逗号一次添加多个',
    inputWidth = 240,
    splitter = DEFAULT_SPLITTER,
    scroll = false,
    itemLabel,
    emptyText = '暂无',
    onCount,
    className,
}: TagListEditorProps): React.JSX.Element {
    const toast = useStore((s) => s.toast);
    const [draft, setDraft] = useState('');

    useEffect(() => {
        onCount?.(list.length);
    }, [list.length, onCount]);

    const commit = (): void => {
        const raw = draft.trim();
        if (!raw) return;

        const parts = raw
            .split(splitter)
            .map((part) => part.trim())
            .filter(Boolean);

        const added: string[] = [];
        let duplicated = 0;
        parts.forEach((value) => {
            if (list.includes(value) || added.includes(value)) {
                duplicated += 1;
                return;
            }
            added.push(value);
        });

        if (!added.length) {
            toast(duplicated ? '这些项都已经在列表里了' : '没有可添加的内容');
            return;
        }

        setDraft('');
        onChange([...list, ...added]);
        if (duplicated) toast(`已添加 ${added.length} 项，跳过 ${duplicated} 项重复`);
    };

    const removeAt = (index: number): void => {
        const next = list.slice();
        next.splice(index, 1);
        onChange(next);
    };

    return (
        <div className={className}>
            <div className="flex flex-wrap items-center gap-2.5">
                <Input
                    value={draft}
                    placeholder={placeholder}
                    style={{ width: inputWidth }}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            commit();
                        }
                    }}
                />
                <Button onClick={commit}>添加</Button>
            </div>

            <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[11px] text-subtle">
                    共 {list.length} 项
                </span>
                {list.length ? (
                    <button
                        type="button"
                        onClick={() => onChange([])}
                        className="cursor-pointer text-[11px] text-subtle underline-offset-4 hover:text-ink hover:underline"
                    >
                        清空
                    </button>
                ) : null}
            </div>

            <div
                className={cn(
                    'mt-1.5 flex flex-wrap gap-1.5',
                    scroll && 'max-h-[156px] overflow-auto pr-1',
                )}
            >
                {list.length === 0 ? (
                    <Tag>{emptyText}</Tag>
                ) : (
                    list.map((value, index) => (
                        <Tag key={`${value}-${index}`} onRemove={() => removeAt(index)}>
                            {itemLabel ? itemLabel(value) : value}
                        </Tag>
                    ))
                )}
            </div>
        </div>
    );
}

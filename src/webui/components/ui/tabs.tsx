import { cn } from '@/lib/utils';

export interface TabItem {
    key: string;
    label: string;
    count?: React.ReactNode;
}

/** 顶部页签：下划线指示当前项 */
export function Tabs({
    items,
    value,
    onChange,
    className,
}: {
    items: TabItem[];
    value: string;
    onChange: (key: string) => void;
    className?: string;
}): React.JSX.Element {
    return (
        <div className={cn('flex items-center gap-1 border-b border-line px-2', className)}>
            {items.map((item) => {
                const active = item.key === value;
                return (
                    <button
                        key={item.key}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(item.key)}
                        className={cn(
                            'relative cursor-pointer px-3 py-2.5 text-[13px] transition-colors',
                            active ? 'text-ink' : 'text-subtle hover:text-ink-2',
                        )}
                    >
                        <span className="flex items-center gap-1.5">
                            {item.label}
                            {item.count !== undefined ? (
                                <span
                                    className={cn(
                                        'rounded-full border px-1.5 text-[11px] leading-4',
                                        active ? 'border-line-strong text-ink-2' : 'border-line text-subtle',
                                    )}
                                >
                                    {item.count}
                                </span>
                            ) : null}
                        </span>
                        {active ? (
                            <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-inverse" />
                        ) : null}
                    </button>
                );
            })}
        </div>
    );
}
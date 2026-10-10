import { cn } from '@/lib/utils';

/** 骨架占位块，配合 .gm-skeleton 的微光动画 */
export function Skeleton({ className }: { className?: string }): React.JSX.Element {
    return <div className={cn('gm-skeleton rounded-control', className)} />;
}
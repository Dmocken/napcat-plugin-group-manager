import { Skeleton } from '@/components/ui/skeleton';

/** 首屏骨架：meta 未就绪时占位，避免加载期白屏 */
export function PageSkeleton(): React.JSX.Element {
    return (
        <div className="space-y-5">
            <div className="grid grid-cols-4 gap-3">
                {Array.from({ length: 4 }, (_, index) => (
                    <Skeleton key={index} className="h-[86px]" />
                ))}
            </div>
            <Skeleton className="h-[320px]" />
            <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 3 }, (_, index) => (
                    <Skeleton key={index} className="h-[120px]" />
                ))}
            </div>
        </div>
    );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom';

interface HintProps {
    /** 提示内容，支持换行 */
    content: ReactNode;
    /** 触发元素（通常是图标按钮） */
    children: ReactNode;
    side?: Side;
    className?: string;
    /** 浮层宽度 */
    width?: number;
    /**
     * 浮层挂到 document.body（fixed 定位）。
     * 列表在 overflow 容器（弹窗里的滚动区）内时必须开启，否则浮窗会被裁切。
     */
    portal?: boolean;
}

const BUBBLE_CLASS =
    'rounded-control border border-line-strong bg-surface-3 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-line text-ink shadow-pop';

/**
 * 轻量悬浮提示：鼠标悬停 / 键盘聚焦触发元素时显示。
 *
 * 默认是纯 CSS 实现（不引入依赖、无 JS 定位）；
 * 需要 `portal` 时改为渲染到 body 并按锚点位置计算 fixed 坐标。
 */
export function Hint({
    content,
    children,
    side = 'top',
    className,
    width = 300,
    portal = false,
}: HintProps): React.JSX.Element {
    const anchorRef = useRef<HTMLSpanElement>(null);
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    /** 按锚点位置算出浮层坐标，并把水平方向收进视口内 */
    const sync = (): void => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const half = width / 2;
        const edge = 12;
        const maxLeft = Math.max(half + edge, window.innerWidth - half - edge);
        setPos({
            top: side === 'top' ? rect.top - 8 : rect.bottom + 8,
            left: Math.min(Math.max(rect.left + rect.width / 2, half + edge), maxLeft),
        });
    };

    // 浮层在 body 上，滚动 / 缩放时要跟着锚点走
    useEffect(() => {
        if (!portal || !visible) return;
        const onChange = (): void => sync();
        window.addEventListener('scroll', onChange, true);
        window.addEventListener('resize', onChange);
        return () => {
            window.removeEventListener('scroll', onChange, true);
            window.removeEventListener('resize', onChange);
        };
        // sync 依赖 side / width，已列在下方
    }, [portal, visible, side, width]);

    if (portal) {
        const show = (): void => {
            sync();
            setVisible(true);
        };
        return (
            <span
                ref={anchorRef}
                className={cn('relative inline-flex', className)}
                onMouseEnter={show}
                onMouseLeave={() => setVisible(false)}
                onFocus={show}
                onBlur={() => setVisible(false)}
            >
                {children}
                {visible
                    ? createPortal(
                          <span
                              role="tooltip"
                              style={{
                                  width,
                                  top: pos.top,
                                  left: pos.left,
                                  transform:
                                      side === 'top'
                                          ? 'translate(-50%, -100%)'
                                          : 'translate(-50%, 0)',
                              }}
                              className={cn(
                                  'pointer-events-none fixed z-[200]',
                                  BUBBLE_CLASS,
                              )}
                          >
                              {content}
                          </span>,
                          document.body,
                      )
                    : null}
            </span>
        );
    }

    return (
        <span className={cn('group/hint relative inline-flex', className)}>
            {children}
            <span
                role="tooltip"
                style={{ width }}
                className={cn(
                    'pointer-events-none invisible absolute left-1/2 z-[120] -translate-x-1/2 opacity-0',
                    'transition-opacity duration-100 group-hover/hint:visible group-hover/hint:opacity-100',
                    'group-focus-within/hint:visible group-focus-within/hint:opacity-100',
                    side === 'top' ? 'bottom-[calc(100%+8px)]' : 'top-[calc(100%+8px)]',
                    BUBBLE_CLASS,
                )}
            >
                {content}
            </span>
        </span>
    );
}

import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface TimeSeries {
    /** 时间桶标签（X 轴） */
    buckets: string[];
    /** 每条折线：名称 + 颜色 + 与 buckets 对齐的计数值 */
    series: { name: string; color: string; values: number[] }[];
}

const PALETTE = [
    '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
    '#eab308', '#06b6d4',
];

const DAY = 86400000;
const HOUR = 3600000;
/** 自动轮播间隔 */
const ROTATE_MS = 3000;
/** 未高亮曲线的透明度 */
const DIM_OPACITY = 0.22;
/** 补零后的最大桶数：超过就退回「只画有数据的桶」，避免稀疏数据撑出上千个点 */
const MAX_BUCKETS = 240;
function parseTime(s: string): number {
    if (!s) return NaN;
    const ms = Date.parse(s.replace(' ', 'T'));
    return Number.isNaN(ms) ? NaN : ms;
}

/**
 * 生成 Y 轴刻度：步长取 1 / 2 / 5 × 10ⁿ 中的整数，保证标签等距且不重复。
 * 直接按 1/4 等分再四舍五入会得到 0 / 3 / 5 / 8 / 10 这种看起来不规则的刻度。
 */
function buildTicks(max: number, target = 5): { top: number; ticks: number[] } {
    if (max <= 0) return { top: 1, ticks: [0, 1] };
    const raw = max / target;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    const step = Math.max(1, Math.round(mult * pow));
    const top = Math.ceil(max / step) * step;
    const ticks: number[] = [];
    for (let v = 0; v <= top; v += step) ticks.push(v);
    return { top, ticks };
}

/**
 * 把记录聚合成时间序列：
 *   - 按时间分桶：跨度 > 1 天按「天」、否则按「小时」；
 *   - 没有记录的桶也补 0，折线不会把空档「拉直」，时间轴间距才可信；
 *   - 按 getGroup 分组（命令名 / 功能等）统计每个桶的计数；
 *   - 系列过多时保留计数最高的 11 个，其余并入「其他」。
 */
export function buildTimeSeries<T>(
    records: T[],
    getTime: (r: T) => string,
    getGroup: (r: T) => string,
    /** 没有记录的组也预先建一条 0 线（用于固定展示六条业务曲线） */
    seedGroups: readonly string[] = [],
    /** 最多保留多少条曲线，超出并入「其他」；展开子项时会调大 */
    maxSeries = 11,
): TimeSeries {
    const pts = records
        .map((r) => ({ t: parseTime(getTime(r)), g: getGroup(r) || '其他' }))
        .filter((p) => !Number.isNaN(p.t))
        .sort((a, b) => a.t - b.t);
    if (!pts.length) return { buckets: [], series: [] };

    const min = pts[0].t;
    const max = pts[pts.length - 1].t;
    const byDay = max - min > DAY;

    /** 按本地日 / 小时对齐：日志时间本身是本地时间，按 UTC 日切会差出一个时区 */
    const dayOf = (t: number): number => {
        const d = new Date(t);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };
    const keyOf = (t: number): number => (byDay ? dayOf(t) : Math.floor(t / HOUR) * HOUR);

    const start = keyOf(min);
    const end = keyOf(max);

    let span: number;
    if (byDay) {
        // 逐日数，跨夏令时也不会算错；超过上限就提前停，走下面的稀疏分支
        span = 0;
        const cursor = new Date(start);
        const last = new Date(end);
        while (cursor.getTime() <= last.getTime() && span <= MAX_BUCKETS) {
            span += 1;
            cursor.setDate(cursor.getDate() + 1);
        }
    } else {
        span = Math.round((end - start) / HOUR) + 1;
    }

    const order: number[] = [];
    const idx = new Map<number, number>();

    if (span <= MAX_BUCKETS) {
        if (byDay) {
            const cursor = new Date(start);
            for (let i = 0; i < span; i += 1) {
                const k = cursor.getTime();
                idx.set(k, order.length);
                order.push(k);
                cursor.setDate(cursor.getDate() + 1);
            }
        } else {
            for (let i = 0; i < span; i += 1) {
                const k = start + i * HOUR;
                idx.set(k, order.length);
                order.push(k);
            }
        }
    } else {
        // 跨度太大时只保留出现过记录的桶，避免上千个空点把图撑爆
        for (const p of pts) {
            const k = keyOf(p.t);
            if (!idx.has(k)) {
                idx.set(k, order.length);
                order.push(k);
            }
        }
    }

    const groups = new Map<string, number[]>();
    for (const name of seedGroups) groups.set(name, new Array(order.length).fill(0));
    for (const p of pts) {
        const gi = idx.get(keyOf(p.t))!;
        let arr = groups.get(p.g);
        if (!arr) {
            arr = new Array(order.length).fill(0);
            groups.set(p.g, arr);
        }
        arr[gi] += 1;
    }

    const fmt = (k: number): string => {
        const d = new Date(k);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        if (byDay) return `${mm}-${dd}`;
        const hh = String(d.getHours()).padStart(2, '0');
        return `${mm}-${dd} ${hh}:00`;
    };

    const buckets = order.map(fmt);

    const enriched = [...groups.entries()]
        .map(([name, values]) => ({
            name,
            values,
            total: values.reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => b.total - a.total);

    const top = enriched.slice(0, maxSeries);
    const rest = enriched.slice(maxSeries);
    const series = top.map((s, i) => ({
        name: s.name,
        color: PALETTE[i % PALETTE.length],
        values: s.values,
    }));
    if (rest.length) {
        const others = rest.reduce<number[]>(
            (acc, s) => acc.map((v, i) => v + s.values[i]),
            new Array(order.length).fill(0),
        );
        series.push({
            name: '其他',
            color: PALETTE[series.length % PALETTE.length],
            values: others,
        });
    }

    // 图例顺序：按「业务组总条数」排，组内父线在前、子项按条数排。
    // 这样拆开子项后，子线始终紧跟在所属业务组后面，而不是散到列表末尾。
    const totalByName = new Map(
        series.map((s) => [s.name, s.values.reduce((a, b) => a + b, 0)]),
    );
    const baseTotal = new Map<string, number>();
    for (const s of series) {
        const base = s.name.split(' · ')[0];
        baseTotal.set(base, (baseTotal.get(base) ?? 0) + (totalByName.get(s.name) ?? 0));
    }
    const rank = new Map(
        [...baseTotal.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([base], index) => [base, index] as const),
    );
    series.sort((a, b) => {
        const aBase = a.name.split(' · ')[0];
        const bBase = b.name.split(' · ')[0];
        const rankDiff =
            (rank.get(aBase) ?? Number.MAX_SAFE_INTEGER) -
            (rank.get(bBase) ?? Number.MAX_SAFE_INTEGER);
        if (rankDiff) return rankDiff;
        const aIsParent = a.name === aBase;
        const bIsParent = b.name === bBase;
        if (aIsParent !== bIsParent) return aIsParent ? -1 : 1;
        return (totalByName.get(b.name) ?? 0) - (totalByName.get(a.name) ?? 0);
    });

    return { buckets, series };
}

/**
 * 轻量 SVG 多序列折线图（零依赖，viewBox 自适应宽度）。
 *
 * 交互：
 *   - 默认轮播高亮一条曲线（其余变暗），每 3 秒切换；
 *   - 鼠标进入图表区域时暂停轮播，悬停处显示该时间桶的数值浮层；
 *   - 点击图例固定某条曲线（再点一次恢复轮播）；
 *   - 系统开启「减少动态效果」时不轮播。
 */
export function TimeSeriesChart({
    data,
    height = 240,
    groupChildren,
    split,
    onToggleSplit,
    onSetSplit,
}: {
    data: TimeSeries;
    height?: number;
    /** 分组 → 子项；有子项的分组在图例右侧显示下拉箭头 */
    groupChildren?: Record<string, string[]>;
    /** 已拆分的子项：分组 → 子项集合 */
    split?: Record<string, ReadonlySet<string>>;
    onToggleSplit?: (group: string, child: string) => void;
    onSetSplit?: (group: string, children: string[]) => void;
}): React.JSX.Element {
    const W = 800;
    const H = height;
    const padL = 30;
    const padR = 10;
    const padT = 8;
    const padB = 24;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const { buckets, series } = data;
    const n = buckets.length;
    const count = series.length;

    const [active, setActive] = useState(0);
    /** 点击图例固定的曲线名；null = 自动轮播 */
    const [pinnedName, setPinnedName] = useState<string | null>(null);
    const [hover, setHover] = useState<number | null>(null);
    /** 鼠标停在图例上时也暂停轮播 */
    const [legendHover, setLegendHover] = useState(false);
    /** 当前打开子项下拉的分组名 */
    const [openGroup, setOpenGroup] = useState<string | null>(null);
    const [reduceMotion] = useState(
        () =>
            typeof window !== 'undefined' &&
            Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    );

    const pinnedIndex = pinnedName === null ? -1 : series.findIndex((s) => s.name === pinnedName);
    const focus = pinnedIndex >= 0 ? pinnedIndex : count ? active % count : 0;

    // 数据变化后把下标夹回有效范围；被固定的曲线消失时自动恢复轮播
    useEffect(() => {
        setActive((a) => (count ? a % count : 0));
        if (pinnedName !== null && !series.some((s) => s.name === pinnedName)) setPinnedName(null);
    }, [count, pinnedName, series]);

    /** 有数据的曲线下标：轮播时跳过全 0 的线（例如固定展示但暂无数据的「系统」组） */
    const activeIdxs = useMemo(
        () =>
            series
                .map((_, i) => i)
                .filter((i) => series[i].values.some((v) => v > 0)),
        [series],
    );

    // 自动轮播：悬停图表（有 hover 桶）/ 悬停图例 / 固定 / 减少动态效果 / 不足两条时暂停
    const paused = hover !== null || legendHover;
    useEffect(() => {
        if (reduceMotion || paused || pinnedName !== null || activeIdxs.length <= 1) return;
        const id = window.setInterval(() => {
            setActive((a) => {
                const pos = activeIdxs.indexOf(a);
                return activeIdxs[(pos + 1) % activeIdxs.length];
            });
        }, ROTATE_MS);
        return () => window.clearInterval(id);
    }, [reduceMotion, paused, pinnedName, activeIdxs]);

    /** Y 轴：整数等距刻度 */
    const axis = useMemo(() => {
        let m = 0;
        for (const s of series) for (const v of s.values) if (v > m) m = v;
        return buildTicks(m);
    }, [series]);
    const maxVal = axis.top;

    const totals = useMemo(
        () => series.map((s) => s.values.reduce((a, b) => a + b, 0)),
        [series],
    );

    const hovered = useMemo(() => {
        if (hover === null) return [];
        return series
            .map((s, i) => ({ name: s.name, color: s.color, value: s.values[hover] ?? 0, index: i }))
            .filter((row) => row.value > 0)
            .sort((a, b) => b.value - a.value);
    }, [hover, series]);

    if (!n) {
        return (
            <p className="px-5 py-10 text-center text-[13px] text-subtle">
                暂无数据可绘制
            </p>
        );
    }

    const x = (i: number): number =>
        n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW;
    const y = (v: number): number => padT + plotH - (v / maxVal) * plotH;

    // X 轴标签：等距取样；最后一个标签离前一个太近时替换掉前一个，避免重叠
    const labelStep = Math.max(1, Math.ceil(n / 8));
    const labelIdx = new Set<number>();
    for (let i = 0; i < n; i += labelStep) labelIdx.add(i);
    const last = n - 1;
    if (!labelIdx.has(last)) {
        const prev = last - (last % labelStep);
        if (prev !== last && last - prev < Math.ceil(labelStep * 0.6)) labelIdx.delete(prev);
        labelIdx.add(last);
    }

    const ticks = axis.ticks;

    const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (!rect.width) return;
        const vx = ((e.clientX - rect.left) / rect.width) * W;
        const i = Math.round(((vx - padL) / plotW) * (n - 1));
        setHover(Math.max(0, Math.min(n - 1, i)));
    };

    const tipTotal = hovered.reduce((sum, row) => sum + row.value, 0);
    const tipLeft = hover === null ? 50 : (x(hover) / W) * 100;

    return (
        <div className="px-1 py-2" onPointerLeave={() => setHover(null)}>
            <div className="relative">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="h-auto w-full cursor-crosshair"
                    role="img"
                    aria-label="日志数量时间序列图"
                    onPointerMove={onMove}
                    onPointerLeave={() => setHover(null)}
                >
                    {/* Y 轴网格与刻度 */}
                    {ticks.map((v) => {
                        const yy = y(v);
                        return (
                            <g key={v}>
                                <line
                                    x1={padL}
                                    y1={yy}
                                    x2={W - padR}
                                    y2={yy}
                                    stroke="rgba(128,128,128,0.22)"
                                    strokeWidth={1}
                                />
                                <text
                                    x={padL - 4}
                                    y={yy + 3}
                                    textAnchor="end"
                                    fontSize={10}
                                    fill="currentColor"
                                    className="text-subtle"
                                >
                                    {v}
                                </text>
                            </g>
                        );
                    })}

                    {/* X 轴刻度：首尾贴边对齐，避免最右侧标签被 viewBox 裁掉 */}
                    {buckets.map((b, i) =>
                        labelIdx.has(i) ? (
                            <text
                                key={i}
                                x={i === 0 ? padL : i === last ? W - padR : x(i)}
                                y={H - 7}
                                textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
                                fontSize={10}
                                fill="currentColor"
                                className="text-subtle"
                            >
                                {b}
                            </text>
                        ) : null,
                    )}

                    {/* hover 竖向指示线 */}
                    {hover !== null ? (
                        <line
                            x1={x(hover)}
                            y1={padT}
                            x2={x(hover)}
                            y2={padT + plotH}
                            stroke="rgba(160,160,160,0.5)"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                            vectorEffect="non-scaling-stroke"
                        />
                    ) : null}

                    {/* 折线：当前高亮的最后画，保证压在其它线之上 */}
                    {series
                        .map((s, i) => ({ s, i }))
                        .sort((a, b) => (a.i === focus ? 1 : 0) - (b.i === focus ? 1 : 0))
                        .map(({ s, i }) => {
                            const on = i === focus;
                            return (
                                <polyline
                                    key={s.name}
                                    points={s.values.map((v, k) => `${x(k)},${y(v)}`).join(' ')}
                                    fill="none"
                                    stroke={s.color}
                                    strokeWidth={on ? 2.2 : 1.2}
                                    strokeOpacity={on ? 1 : DIM_OPACITY}
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                    vectorEffect="non-scaling-stroke"
                                    style={{
                                        transition: reduceMotion
                                            ? undefined
                                            : 'stroke-opacity 240ms ease, stroke-width 240ms ease',
                                    }}
                                />
                            );
                        })}

                    {/* hover 时在每条线上标出对应点 */}
                    {hover !== null
                        ? series.map((s, i) => {
                              const v = s.values[hover] ?? 0;
                              if (v <= 0) return null;
                              const on = i === focus;
                              return (
                                  <circle
                                      key={`dot-${s.name}`}
                                      cx={x(hover)}
                                      cy={y(v)}
                                      r={on ? 3 : 2.2}
                                      fill={s.color}
                                      opacity={on ? 1 : 0.7}
                                  />
                              );
                          })
                        : null}

                    {/* 桶很少时补点，避免单点数据只剩一条看不见的线 */}
                    {hover === null && n <= 14
                        ? series.flatMap((s, i) =>
                              s.values.map((v, k) => {
                                  const on = i === focus;
                                  return (
                                      <circle
                                          key={`pt-${s.name}-${k}`}
                                          cx={x(k)}
                                          cy={y(v)}
                                          r={on ? 2.6 : 2}
                                          fill={s.color}
                                          opacity={on ? 1 : DIM_OPACITY + 0.2}
                                      />
                                  );
                              }),
                          )
                        : null}
                </svg>

                {/* hover 浮层：该时间桶里各曲线的数量 */}
                {hover !== null ? (
                    <div
                        className="pointer-events-none absolute top-1 z-10 w-max max-w-[210px] -translate-x-1/2 rounded-control border border-line-strong bg-surface px-2.5 py-2 text-[11px] shadow-pop"
                        style={{ left: `${Math.min(88, Math.max(12, tipLeft))}%` }}
                    >
                        <div className="mb-1 font-mono-num text-[10px] text-subtle">{buckets[hover]}</div>
                        {hovered.length ? (
                            <div className="flex flex-col gap-0.5">
                                {hovered.slice(0, 6).map((row) => (
                                    <div
                                        key={row.name}
                                        className={cn(
                                            'flex items-center gap-1.5',
                                            row.index === focus ? 'text-ink' : 'text-muted',
                                        )}
                                    >
                                        <span
                                            className="inline-block size-2 shrink-0 rounded-sm"
                                            style={{ background: row.color }}
                                        />
                                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                                        <span className="font-mono-num tabular-nums">{row.value}</span>
                                    </div>
                                ))}
                                {hovered.length > 6 ? (
                                    <div className="text-[10px] text-subtle">
                                        另有 {hovered.length - 6} 项
                                    </div>
                                ) : null}
                                <div className="mt-1 flex items-center justify-between border-t border-line pt-1 text-[10px] text-subtle">
                                    <span>合计</span>
                                    <span className="font-mono-num tabular-nums">{tipTotal}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-subtle">该时段无记录</div>
                        )}
                    </div>
                ) : null}
            </div>

            {/* 图例：点击固定某一曲线，再次点击恢复自动轮播 */}
            <div
                className="flex flex-wrap items-center gap-1 px-3 pt-1 pb-1"
                onPointerEnter={() => setLegendHover(true)}
                onPointerLeave={() => setLegendHover(false)}
            >
                {series.map((s, i) => {
                    const on = i === focus;
                    const isPinned = pinnedName === s.name;
                    const [parent, child] = s.name.split(' · ');
                    const isChild = Boolean(child);
                    const group = isChild ? parent : s.name;
                    const children = isChild ? undefined : groupChildren?.[group];
                    return (
                        <span key={s.name} className="flex items-center gap-0.5">
                            <button
                                type="button"
                                onClick={() => setPinnedName((p) => (p === s.name ? null : s.name))}
                                aria-pressed={isPinned}
                                title={isPinned ? '再次点击恢复自动切换' : '点击固定显示这条曲线'}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-control border px-1.5 py-0.5 text-[11px] transition-colors',
                                    on
                                        ? 'border-line-strong bg-surface-2 text-ink'
                                        : 'border-transparent text-muted hover:bg-surface-2',
                                )}
                            >
                                <span
                                    className="inline-block size-2.5 shrink-0 rounded-sm"
                                    style={{ background: s.color, opacity: on ? 1 : 0.45 }}
                                />
                                <span className="max-w-[140px] truncate">{s.name}</span>
                                <span className="font-mono-num text-[10px] text-subtle">{totals[i]}</span>
                            </button>
                            {children?.length ? (
                                <Popover
                                    open={openGroup === group}
                                    onOpenChange={(v) => setOpenGroup(v ? group : null)}
                                >
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            aria-label={'展开 ' + group + ' 的子项'}
                                            title="选择要拆开显示的子项"
                                            className="grid size-5 shrink-0 cursor-pointer place-items-center rounded text-subtle transition-colors hover:bg-surface-3 hover:text-ink"
                                        >
                                            <ChevronDown className="size-3" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent
                                        align="start"
                                        sideOffset={6}
                                        portal={false}
                                        width={190}
                                        className="p-1.5"
                                    >
                                        <div className="px-1.5 pb-1 text-[10px] text-subtle">
                                            {group} · 子项
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            {children.map((item) => {
                                                const checked = split?.[group]?.has(item) ?? false;
                                                return (
                                                    <button
                                                        key={item}
                                                        type="button"
                                                        role="checkbox"
                                                        aria-checked={checked}
                                                        onClick={() => onToggleSplit?.(group, item)}
                                                        className={cn(
                                                            'flex w-full cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-surface-2',
                                                            checked ? 'text-ink' : 'text-muted',
                                                        )}
                                                    >
                                                        <span
                                                            className={cn(
                                                                'grid size-3.5 shrink-0 place-items-center rounded-[3px] border',
                                                                checked
                                                                    ? 'border-inverse bg-inverse text-inverse-ink'
                                                                    : 'border-line-strong',
                                                            )}
                                                        >
                                                            {checked ? <Check className="size-2.5" /> : null}
                                                        </span>
                                                        <span className="min-w-0 flex-1 truncate">{item}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div className="mt-1 flex items-center gap-2 border-t border-line px-1.5 pt-1 text-[10px] text-subtle">
                                            <button
                                                type="button"
                                                className="cursor-pointer hover:text-ink"
                                                onClick={() => onSetSplit?.(group, children)}
                                            >
                                                全选
                                            </button>
                                            <button
                                                type="button"
                                                className="cursor-pointer hover:text-ink"
                                                onClick={() => onSetSplit?.(group, [])}
                                            >
                                                全不选
                                            </button>
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            ) : null}
                        </span>
                    );
                })}
                {count > 1 ? (
                    <span className="ml-auto shrink-0 text-[10px] text-subtle">
                        {pinnedName !== null
                            ? '已固定 · 再点恢复'
                            : reduceMotion
                              ? '已关闭自动切换'
                              : `每 ${ROTATE_MS / 1000} 秒切换`}
                    </span>
                ) : null}
            </div>
        </div>
    );
}

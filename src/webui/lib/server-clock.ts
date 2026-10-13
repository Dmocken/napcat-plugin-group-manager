/**
 * 服务端时钟。
 *
 * 后端在**每个接口的响应头**里回带 `x-server-time`（服务端毫秒时间戳），这里据此估算
 * 「服务端时间 − 本地时间」的偏移，之后再用 performance.now()（单调钟）外推。
 *
 * 这样做的意义：服务端给的时间点（比如禁言开始时间）都能换算到同一个时间轴上的
 * 绝对值，「现在」永远由 serverNowSeconds() 现算。于是：
 *   - 轮询刷新、切走页面再回来、标签页休眠唤醒，读数都不会跳变；
 *   - 客户端时钟与后端不一致（手机时区 / 手动改过时间）也不影响；
 *   - 用户中途改系统时间、NTP 校时跳变也不会让倒计时乱跳（只认单调钟）。
 *
 * 约定：凡是要在本地「走着走」的时长，都写成两个服务端秒相减，
 * 不要再用「服务端下发一个相对量 + 本地流逝秒数」那种混时钟的写法。
 */

import { useEffect, useState } from 'react';

/**
 * 参与估算的采样窗口：取其中 RTT 最小的一条（NTP 的做法 —— 路径最短，估算最准）。
 * 用窗口也顺带挡掉「慢接口」：响应头是在请求**开始时**打的时间戳，像群发那种跑几分钟
 * 的接口，RTT 会非常大，按往返补偿折算出来的服务端时间会偏出去几十秒。
 */
const WINDOW = 8;

/** 超过该往返耗时（毫秒）的响应不参与估算，避免慢接口把时钟带偏 */
const MAX_RTT = 5000;

/** 偏差达到该秒数就认为「时间轴本身变了」，直接重锚；更小的抖动一律平滑处理 */
const SNAP_SECONDS = 1;

/** 平滑系数：每次采样只修正偏差的 1/8，几十毫秒级的估算噪声就被摊平了，读数不会跳 */
const SLEW = 1 / 8;

interface Sample {
    /** 采样时刻的服务端秒（已补偿半个往返） */
    server: number;
    /** 与 server 对应的单调钟读数（毫秒） */
    mono: number;
    /** 往返耗时（毫秒），越小越可信 */
    rtt: number;
}

/** 已采用的锚点：服务端秒 server 对应单调钟 mono；null = 还没校准过（先退回本地时钟） */
let anchor: Sample | null = null;

const samples: Sample[] = [];

const monoNow = (): number => performance.now();

/** 服务端当前时间（秒，浮点）。未校准前退回本地时钟 */
export function serverNowSeconds(): number {
    if (!anchor) return Date.now() / 1000;
    return anchor.server + (monoNow() - anchor.mono) / 1000;
}

/** 取窗口里 RTT 最小的一条 */
function bestSample(): Sample | null {
    return samples.reduce<Sample | null>(
        (min, item) => (!min || item.rtt < min.rtt ? item : min),
        null,
    );
}

/**
 * 记录一条响应里带回来的服务端时间。
 *
 * serverTimeMs = 响应头里的服务端毫秒时间戳；
 * t1 = 发请求前、t4 = 收到响应后的 Date.now()（毫秒），两者只用来算往返耗时，
 * 因此客户端墙上时钟怎么跳都不影响这里的估算结果。
 */
export function noteServerTime(serverTimeMs: number, t1: number, t4: number): void {
    if (!Number.isFinite(serverTimeMs) || serverTimeMs <= 0) return;

    const rtt = Math.max(0, t4 - t1);
    if (rtt > MAX_RTT) return;

    // 响应头里的时间取在「请求刚进来」那一刻，收到时大约过了半个往返
    samples.push({ server: serverTimeMs / 1000 + rtt / 2000, mono: monoNow(), rtt });
    if (samples.length > WINDOW) samples.shift();

    const pick = bestSample();
    if (!pick) return;

    // 还没校准：直接采用当前最优样本
    if (!anchor) {
        anchor = pick;
        return;
    }

    // 用现有锚点预测 pick 那一刻的服务端时间，差值就是这次估算的偏差
    const predicted = anchor.server + (pick.mono - anchor.mono) / 1000;
    const delta = pick.server - predicted;

    // 偏差很大 → 时间轴确实变了（服务端换机 / 时钟被校准），跟着跳是对的
    if (Math.abs(delta) >= SNAP_SECONDS) {
        anchor = pick;
        return;
    }

    // 偏差很小 → 只挪一点点，逐次收敛；这样倒计时永远不会出现可见的跳变，
    // 又不会让估算长期漂走（单调钟与服务端墙上时钟的速率本来就有微小差别）
    anchor = { ...anchor, server: anchor.server + delta * SLEW };
}

/** 每秒走动的「服务端秒」（整数），供倒计时这类展示使用 */
export function useServerNow(): number {
    const [now, setNow] = useState(() => Math.floor(serverNowSeconds()));

    useEffect(() => {
        const id = window.setInterval(() => setNow(Math.floor(serverNowSeconds())), 1000);
        return () => window.clearInterval(id);
    }, []);

    return now;
}

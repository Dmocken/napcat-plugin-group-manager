/**
 * 延时任务管理
 *
 * 替代 NoneBot 里的 asyncio.sleep / create_task；
 * 所有定时器统一登记，插件重载或卸载时一并清理，避免重载后重复触发。
 */

const timers = new Set<NodeJS.Timeout>();

/** 登记一个延时任务 */
export function schedule(ms: number, fn: () => void | Promise<void>): NodeJS.Timeout {
    const timer = setTimeout(() => {
        timers.delete(timer);
        void Promise.resolve()
            .then(fn)
            .catch(() => undefined);
    }, ms);
    timers.add(timer);
    return timer;
}

export function cancel(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    timers.delete(timer);
}

/** 清理全部延时任务（plugin_cleanup 调用） */
export function clearAllTimers(): number {
    const count = timers.size;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    return count;
}

export function timerCount(): number {
    return timers.size;
}

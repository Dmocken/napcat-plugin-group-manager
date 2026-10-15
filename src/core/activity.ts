/**
 * 功能调用日志
 *
 * 记录「什么时间、哪个群、谁、调用了什么功能、机器人发送了什么、结果如何」，
 * 与错误日志分开落在 data/activity.log（按行 JSON），供 WebUI 的「最近调用」面板展示。
 *
 * 数据流：
 *   1. router / events 命中功能时 beginActivity() 开启一条记录；
 *   2. 期间所有出站消息经 sendGroup / sendPrivate / sendForward → noteActivitySent() 汇总；
 *   3. 处理结束（成功 / 失败 / 被拒绝）时 finish() 落盘。
 */

import type { FeatureKey } from '../types';
import { startedAt, stamp } from './state';
import { appendLogLine, clearLogFile, readLogLines } from './store';

export type ActivityResult = 'ok' | 'fail' | 'reject';
export type ActivitySource = 'command' | 'event' | 'api';

export interface ActivityRecord {
    /** 本地时间 YYYY-MM-DD HH:mm:ss */
    time: string;
    /** 记录产生时的插件启动时间戳，用于区分本次启动与历史记录 */
    boot: number;
    /** 调用来源：命令 / 事件 / 接口 */
    source: ActivitySource;
    /** 该次调用具体的命令名或事件类型，如 ban / notice:group_ban */
    action: string;
    /** 所属功能；system 表示系统级（帮助、权限提示等） */
    feature: string;
    groupId: string;
    /** 触发者 QQ */
    userId: string;
    /** 触发者昵称，仅供界面显示（事件通知通常拿不到） */
    userName?: string;
    /** 触发内容：用户消息原文 / 事件摘要 */
    input: string;
    /** 机器人实际发出的内容，多条用 ⏎ 连接 */
    sent: string;
    result: ActivityResult;
    /** 结果说明（失败原因、拒绝原因等） */
    note: string;
}

/** 内存与落盘一致的保留条数 */
const ACTIVITY_KEEP = 200;
const ACTIVITY_LOG = 'activity.log';
/** 单条记录里触发内容 / 发送内容的截断长度 */
const MAX_TEXT = 300;

interface Pending {
    record: ActivityRecord;
    handle?: ActivityHandle;
}

const buffer: ActivityRecord[] = [];
/** 进行中的调用；正常情况下同时只有一条，用栈兜住意外的嵌套 */
const stack: Pending[] = [];

function clip(value: unknown, max = MAX_TEXT): string {
    const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

export interface ActivityInit {
    source: ActivitySource;
    action: string;
    feature: FeatureKey | 'system';
    groupId?: string | number;
    userId?: string | number;
    userName?: string;
    input?: unknown;
}

export interface ActivityHandle {
    /** 结束本次记录并落盘；重复调用无副作用 */
    finish: (result: ActivityResult, note?: unknown) => void;
    /**
     * 延迟收尾：调用后 finish() 不再生效，记录会从当前上下文摘除，
     * 需由持有者稍后 settle()。用于「要等事件回执才知道结果」的操作（禁言 / 踢人）。
     */
    hold: () => void;
    /** 强制收尾（不受 hold 影响） */
    settle: (result: ActivityResult, note?: unknown) => void;
}

/** handle → 待写入记录，供 withActivity 把延迟回复计入原记录 */
const refs = new WeakMap<ActivityHandle, Pending>();

/** 当前正在进行的那条调用记录（没有则返回 null） */
export function currentActivity(): ActivityHandle | null {
    return stack[stack.length - 1]?.handle ?? null;
}

/** 开始一条调用记录 */
export function beginActivity(init: ActivityInit): ActivityHandle {
    const pending: Pending = {
        record: {
            time: stamp(),
            boot: startedAt,
            source: init.source,
            action: clip(init.action, 60),
            feature: String(init.feature ?? 'system'),
            groupId: init.groupId === undefined || init.groupId === 0 ? '' : String(init.groupId),
            userId: init.userId === undefined || init.userId === 0 ? '' : String(init.userId),
            userName: clip(init.userName, 60),
            input: clip(init.input),
            sent: '',
            result: 'ok',
            note: '',
        },
    };

    let closed = false;
    let held = false;

    const detach = (): void => {
        const index = stack.indexOf(pending);
        if (index >= 0) stack.splice(index, 1);
    };

    const commit = (result: ActivityResult, note: unknown = ''): void => {
        if (closed) return;
        closed = true;
        detach();

        pending.record.result = result;
        pending.record.note = clip(note, 200);
        buffer.unshift(pending.record);
        if (buffer.length > ACTIVITY_KEEP) buffer.length = ACTIVITY_KEEP;
        appendLogLine(ACTIVITY_LOG, JSON.stringify(pending.record));
    };

    const handle: ActivityHandle = {
        finish: (result, note) => {
            if (held) return;
            commit(result, note);
        },
        hold: () => {
            held = true;
            detach();
        },
        settle: (result, note) => commit(result, note),
    };

    pending.handle = handle;
    refs.set(handle, pending);
    stack.push(pending);
    return handle;
}

/**
 * 在指定记录上下文中执行：期间发出的消息都会计入该记录。
 * 用于延迟回复（如收到踢人通知后再发结果），此时原记录已不在上下文里。
 */
export async function withActivity<T>(
    handle: ActivityHandle | null | undefined,
    run: () => Promise<T>,
): Promise<T> {
    const pending = handle ? refs.get(handle) : undefined;
    if (!pending) return run();

    stack.push(pending);
    try {
        return await run();
    } finally {
        const index = stack.lastIndexOf(pending);
        if (index >= 0) stack.splice(index, 1);
    }
}

/**
 * 记录一条出站消息（由 messages.ts 的发送函数调用）
 * @param summary 已摘要的单行内容
 */
export function noteActivitySent(summary: string): void {
    const pending = stack[stack.length - 1];
    if (!pending || !summary) return;
    const merged = pending.record.sent ? `${pending.record.sent} ⏎ ${summary}` : summary;
    pending.record.sent = clip(merged, MAX_TEXT * 2);
}

/** 最近的调用记录（优先读落盘日志，跨重启可见） */
export function recentActivities(limit = ACTIVITY_KEEP): ActivityRecord[] {
    const fromFile = readLogLines(ACTIVITY_LOG, limit) as ActivityRecord[];
    if (fromFile.length) return fromFile;
    return buffer.slice(0, limit);
}

/**
 * 清空调用日志：内存缓冲与 activity.log 一起清。
 * 只删文件是不够的 —— 文件为空时 recentActivities 会回退到内存里那批记录。
 */
export function clearActivityLog(): void {
    buffer.length = 0;
    clearLogFile(ACTIVITY_LOG);
}

/**
 * 重复加群检测
 *
 * OneBot / NapCat 没有「查询某个 QQ 加了哪些群」的接口，因此采用「快照 + 实时补充」：
 *   - 快照：WebUI 里勾选若干群 → 导出成员名单落到 data/dup_snapshot.json，
 *           加群申请时直接查表，不调接口（快，但快照过期会漏判）
 *   - 实时：对参与查重、但快照里没有记录的群，调用 get_group_member_list 拉取（带缓存）
 *
 * 参与查重的群由「群配置 → 加群审核 → 参与查重的群」决定，按配置独立生效，
 * 不会和其它群配置互相影响；本群自身永远排除。
 */

import fs from 'node:fs';

import { callAction } from '../core/messages';
import { logDebug, logWarn } from '../core/state';
import { dataFile } from '../core/store';

const SNAPSHOT_FILE = 'dup_snapshot.json';
/** 旧版遗留的纯 { 群号: [QQ号] } 文件，作为兼容回退 */
const LEGACY_FILE = 'group_members.json';

/** 实时模式下的成员缓存，避免每次加群都全量拉取 */
const CACHE_TTL = 10 * 60 * 1000;
const memberCache = new Map<string, { at: number; ids: Set<string> }>();

/** 快照超过该时间视为过期 */
export const SNAPSHOT_STALE_MS = 6 * 60 * 60 * 1000;

export interface DupSnapshot {
    updatedAt: number;
    groups: Record<string, string[]>;
    /** 群号 → 群名；导出时一并记录，供前端在勾选列表里显示 */
    names: Record<string, string>;
}

export interface DupSnapshotInfo {
    exists: boolean;
    updatedAt: number;
    groups: number;
    members: number;
    stale: boolean;
    /** 快照里记录了成员名单的群号（供前端在「参与查重的群」里勾选） */
    groupIds: string[];
    /** 快照里记录到的群名（群号 → 群名）；没有记录到的群不会出现 */
    groupNames: Record<string, string>;
}

export interface DupCheckResult {
    hit: boolean;
    groupId?: string;
    /** 命中来源：读快照 / 实时拉取 / 无候选群 */
    used: 'snapshot' | 'live' | 'none';
    warning?: string;
}

function readJsonFile(file: string): unknown {
    try {
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
        return null;
    }
}

function normalizeGroups(input: Record<string, string[]>): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    Object.entries(input ?? {}).forEach(([gid, ids]) => {
        if (!Array.isArray(ids)) return;
        const list = ids.map((v) => String(v)).filter(Boolean);
        if (list.length) out[String(gid)] = list;
    });
    return out;
}

/** 规范化「群号 → 群名」，丢掉空值 */
function normalizeNames(input: Record<string, string> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    Object.entries(input ?? {}).forEach(([gid, name]) => {
        const value = String(name ?? '').trim();
        if (gid && value) out[String(gid)] = value;
    });
    return out;
}

/** 读取快照：新格式优先，旧文件回退（旧文件没有群名） */
export function readSnapshot(): DupSnapshot | null {
    const raw = readJsonFile(dataFile(SNAPSHOT_FILE));
    if (raw && typeof raw === 'object') {
        const r = raw as Partial<DupSnapshot>;
        const groups =
            r.groups && typeof r.groups === 'object'
                ? (r.groups as Record<string, string[]>)
                : (raw as Record<string, string[]>);
        const names =
            r.names && typeof r.names === 'object'
                ? (r.names as Record<string, string>)
                : undefined;
        return {
            updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
            groups: normalizeGroups(groups),
            names: normalizeNames(names),
        };
    }

    const legacy = readJsonFile(dataFile(LEGACY_FILE));
    if (legacy && typeof legacy === 'object') {
        return {
            updatedAt: 0,
            groups: normalizeGroups(legacy as Record<string, string[]>),
            names: {},
        };
    }
    return null;
}

export function writeSnapshot(
    groups: Record<string, string[]>,
    names: Record<string, string> = {},
): DupSnapshot {
    const snapshot: DupSnapshot = {
        updatedAt: Date.now(),
        groups: normalizeGroups(groups),
        names: normalizeNames(names),
    };
    fs.writeFileSync(dataFile(SNAPSHOT_FILE), JSON.stringify(snapshot), 'utf-8');
    return snapshot;
}

export function snapshotInfo(): DupSnapshotInfo {
    const snap = readSnapshot();
    if (!snap) {
        return {
            exists: false,
            updatedAt: 0,
            groups: 0,
            members: 0,
            stale: false,
            groupIds: [],
            groupNames: {},
        };
    }
    let members = 0;
    Object.values(snap.groups).forEach((ids) => {
        members += ids.length;
    });
    const groupIds = Object.keys(snap.groups);
    // 只回传确实有成员名单的群的群名
    const groupNames: Record<string, string> = {};
    groupIds.forEach((gid) => {
        const name = snap.names[gid];
        if (name) groupNames[gid] = name;
    });
    return {
        exists: true,
        updatedAt: snap.updatedAt,
        groups: groupIds.length,
        members,
        // 没有时间戳的旧文件视为已过期
        stale: !snap.updatedAt || Date.now() - snap.updatedAt > SNAPSHOT_STALE_MS,
        groupIds,
        groupNames,
    };
}

/** 拉取单个群的全部成员 QQ（带缓存） */
async function fetchMembers(groupId: string, useCache: boolean): Promise<Set<string>> {
    const cached = memberCache.get(groupId);
    if (useCache && cached && Date.now() - cached.at < CACHE_TTL) return cached.ids;

    const list = await callAction<Array<Record<string, unknown>>>('get_group_member_list', {
        group_id: groupId,
        no_cache: useCache ? 0 : 1,
    });
    const ids = new Set<string>();
    if (Array.isArray(list)) {
        list.forEach((m) => {
            const id = m?.user_id ?? m?.userId ?? m?.qq;
            if (id !== undefined && id !== null && String(id).trim()) ids.add(String(id).trim());
        });
    }
    memberCache.set(groupId, { at: Date.now(), ids });
    return ids;
}

/**
 * 检测某个 QQ 是否已在指定的群里
 *
 * 候选群就是调用方传入的 groups（来自「群配置 → 加群审核 → 参与查重的群」），
 * 本群自身永远排除。先查快照，快照里没有记录的群再实时拉取成员。
 *
 * @param groups 参与查重的群号
 * @param currentGroup 当前申请的群
 * @param userId 申请人 QQ
 */
export async function checkDuplicate(
    groups: string[] | undefined,
    currentGroup: number | string,
    userId: number | string,
): Promise<DupCheckResult> {
    const uid = String(userId);
    const cid = String(currentGroup);

    const candidates = new Set<string>();
    (groups ?? []).forEach((g) => {
        const gid = String(g).trim();
        if (gid && gid !== cid) candidates.add(gid);
    });

    if (!candidates.size) return { hit: false, used: 'none' };

    const snap = readSnapshot();

    // 1. 快照查表
    if (snap) {
        for (const gid of candidates) {
            const ids = snap.groups[gid];
            if (ids && ids.includes(uid)) return { hit: true, groupId: gid, used: 'snapshot' };
        }
    }

    // 2. 实时补充：只查快照里没有数据的群
    const missing = [...candidates].filter((gid) => !snap?.groups[gid]);
    if (missing.length) {
        const failed: string[] = [];
        for (const gid of missing) {
            try {
                const ids = await fetchMembers(gid, true);
                if (ids.has(uid)) return { hit: true, groupId: gid, used: 'live' };
            } catch (e) {
                failed.push(gid);
                logDebug(`[群管助手] 重复加群检测：读取群 ${gid} 成员失败`, e);
            }
        }
        if (failed.length) {
            return {
                hit: false,
                used: 'live',
                warning: `群 ${failed.join('、')} 的成员列表读取失败，已跳过这些群`,
            };
        }
        return { hit: false, used: 'live' };
    }

    return { hit: false, used: 'snapshot' };
}

/** 拉取全部群号 → 群名（best-effort：取不到就当作没有群名，不影响快照本身） */
async function fetchGroupNames(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    try {
        const list = await callAction<Array<Record<string, unknown>>>('get_group_list', {});
        if (Array.isArray(list)) {
            list.forEach((g) => {
                const id = g?.group_id ?? g?.groupId;
                const name = g?.group_name ?? g?.groupName;
                if (id === undefined || id === null || name === undefined || name === null) return;
                const gid = String(id).trim();
                const value = String(name).trim();
                if (gid && value) out[gid] = value;
            });
        }
    } catch (e) {
        logDebug('[群管助手] 获取群列表失败，快照将不记录群名', e);
    }
    return out;
}

/** 导出勾选群的成员快照（WebUI 按钮触发），顺带记下群名，方便前端勾选时显示 */
export async function exportSnapshot(
    groupIds: string[],
): Promise<{ groups: number; members: number; failed: { groupId: string; error: string }[] }> {
    const collected: Record<string, string[]> = {};
    const names: Record<string, string> = {};
    const failed: { groupId: string; error: string }[] = [];
    let members = 0;

    // 群名只在导出时拉一次，用于给勾选列表显示
    const knownNames = await fetchGroupNames();

    for (const raw of groupIds) {
        const gid = String(raw).trim();
        if (!/^\d{5,12}$/.test(gid)) continue;
        try {
            const ids = await fetchMembers(gid, false);
            collected[gid] = [...ids];
            members += ids.size;
            const name = knownNames[gid];
            if (name) names[gid] = name;
        } catch (e) {
            failed.push({ groupId: gid, error: e instanceof Error ? e.message : String(e) });
            logWarn(`[群管助手] 导出群 ${gid} 成员失败：`, e);
        }
    }

    writeSnapshot(collected, names);
    memberCache.clear();
    return { groups: Object.keys(collected).length, members, failed };
}

/** 单个快照文件的大小上限（导入时校验，防止超大文件把内存打满） */
const MAX_IMPORT_MEMBERS = 2_000_000;

/** 读取快照文件原文（用于下载备份） */
export function readSnapshotFile(): { filename: string; content: string } {
    const file = dataFile(SNAPSHOT_FILE);
    if (!fs.existsSync(file)) {
        // 没有新格式时回退到旧文件，方便用户把历史文件下载走
        const legacy = dataFile(LEGACY_FILE);
        if (fs.existsSync(legacy)) {
            return { filename: LEGACY_FILE, content: fs.readFileSync(legacy, 'utf-8') };
        }
        throw new Error('还没有生成快照');
    }
    return { filename: SNAPSHOT_FILE, content: fs.readFileSync(file, 'utf-8') };
}

/**
 * 导入快照文件内容
 *
 * 兼容两种格式：
 *   新格式 { updatedAt, groups:{ gid:[qq] }, names:{ gid: 群名 } }
 *   旧格式 { gid:[qq] }（没有群名，前端会退化成显示群号）
 * 主要用于给「bot 不在、无法实时拉取成员」的群补充成员名单。
 *
 * 采用合并语义：导入文件里的群覆盖同名群，快照里已有的其它群保持不变。
 * 想彻底重来请用「清理」。
 */
export function importSnapshot(content: string): { groups: number; members: number; updatedAt: number } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error('文件不是合法的 JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('快照格式不正确：应为 JSON 对象');
    }

    const obj = parsed as Record<string, unknown>;
    const source =
        obj.groups && typeof obj.groups === 'object' && !Array.isArray(obj.groups)
            ? (obj.groups as Record<string, string[]>)
            : (obj as Record<string, string[]>);

    let members = 0;
    Object.values(source).forEach((ids) => {
        if (Array.isArray(ids)) members += ids.length;
    });
    if (members > MAX_IMPORT_MEMBERS) {
        throw new Error(`成员数量过多（${members}），单个快照最多支持 ${MAX_IMPORT_MEMBERS} 条`);
    }

    const incoming = normalizeGroups(source);
    if (!Object.keys(incoming).length) throw new Error('快照里没有任何群成员数据');

    const incomingNames = normalizeNames(
        obj.names && typeof obj.names === 'object' && !Array.isArray(obj.names)
            ? (obj.names as Record<string, string>)
            : undefined,
    );

    // 合并：导入的群覆盖同名群，快照里其它群保留
    const current = readSnapshot();
    const snapshot = writeSnapshot(
        { ...(current?.groups ?? {}), ...incoming },
        { ...(current?.names ?? {}), ...incomingNames },
    );
    memberCache.clear();
    return { groups: Object.keys(incoming).length, members, updatedAt: snapshot.updatedAt };
}

/** 清理快照文件（新旧两种都删），返回是否真的删掉了东西 */
export function clearSnapshot(): boolean {
    let removed = false;
    [dataFile(SNAPSHOT_FILE), dataFile(LEGACY_FILE)].forEach((file) => {
        if (fs.existsSync(file)) {
            try {
                fs.rmSync(file);
                removed = true;
            } catch (e) {
                logWarn(`[群管助手] 删除 ${file} 失败：`, e);
            }
        }
    });
    memberCache.clear();
    return removed;
}

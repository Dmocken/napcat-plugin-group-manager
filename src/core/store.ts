/**
 * 数据落盘层
 *
 * 所有运行数据（配置与业务数据）都写在 NapCat 提供的插件数据目录 ctx.dataPath 下，
 * 与旧 NoneBot 版的文件名保持一致，便于一键导入。
 */

import fs from 'node:fs';
import path from 'node:path';

let dataDir = '';

export function setDataDir(dir: string): void {
    dataDir = dir;
    fs.mkdirSync(dataDir, { recursive: true });
}

export function getDataDir(): string {
    return dataDir;
}

/** 数据目录下的文件绝对路径 */
export function dataFile(name: string): string {
    return path.join(dataDir, name);
}

export function readJson<T>(name: string, fallback: T): T {
    const file = dataFile(name);
    if (!fs.existsSync(file)) return fallback;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    } catch {
        return fallback;
    }
}

export function writeJson(name: string, data: unknown): void {
    const file = dataFile(name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

/* ---------------- 按行 JSON 日志（errors.log / activity.log） ---------------- */

const LOG_MAX_BYTES = 256 * 1024;

/** 日志文件轮转：超过上限时只保留最近 2000 行（与 ERROR_KEEP / ACTIVITY_KEEP 对齐） */
function rotateLog(file: string): void {
    if (!fs.existsSync(file) || fs.statSync(file).size <= LOG_MAX_BYTES) return;
    const kept = fs.readFileSync(file, 'utf-8').split('\n').slice(-2000).join('\n');
    fs.writeFileSync(file, `${kept}\n`, 'utf-8');
}

/** 追加一条日志行；失败静默，不影响主流程 */
export function appendLogLine(name: string, line: string): void {
    if (!dataDir) return;
    try {
        const file = dataFile(name);
        rotateLog(file);
        fs.appendFileSync(file, `${line}\n`, 'utf-8');
    } catch {
        /* 日志写入失败不影响主流程 */
    }
}

/** 读取最近 limit 条日志行（按时间倒序），解析失败的行会被丢弃 */
export function readLogLines(name: string, limit: number): unknown[] {
    const file = dataFile(name);
    if (!fs.existsSync(file)) return [];
    try {
        return fs
            .readFileSync(file, 'utf-8')
            .split('\n')
            .filter(Boolean)
            .slice(-limit)
            .reverse()
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return null;
                }
            })
            .filter((item): item is unknown => item !== null);
    } catch {
        return [];
    }
}

/** 读取整个日志文件（导出下载用）；不存在或读失败返回空串 */
export function readLogFile(name: string): string {
    const file = dataFile(name);
    try {
        return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : '';
    } catch {
        return '';
    }
}

/**
 * 删除日志文件（下次写入会自动重建）。
 * 权限不足 / 被占用时抛出错误，由调用方回给界面，不静默失败。
 */
export function clearLogFile(name: string): void {
    const file = dataFile(name);
    if (!fs.existsSync(file)) return;
    try {
        fs.rmSync(file, { force: true });
    } catch (e) {
        throw new Error(`删除 ${name} 失败：${e instanceof Error ? e.message : String(e)}`);
    }
}

const ERROR_LOG = 'errors.log';

/** 追加一条错误记录 */
export function appendErrorLine(line: string): void {
    appendLogLine(ERROR_LOG, line);
}

/** 读取最近 limit 条错误记录（按时间倒序） */
export function readErrorLines(limit: number): unknown[] {
    return readLogLines(ERROR_LOG, limit);
}

export interface DataFileInfo {
    name: string;
    size: number;
    mtime: number;
}

/** 列出数据目录下的 json 文件（用于 WebUI 数据页） */
export function listDataFiles(): DataFileInfo[] {
    if (!dataDir || !fs.existsSync(dataDir)) return [];
    return fs
        .readdirSync(dataDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
            const st = fs.statSync(dataFile(f));
            return { name: f, size: st.size, mtime: Math.floor(st.mtimeMs) };
        });
}

/** 资源目录（图片等）：dataPath/assets 优先，其次插件目录 assets */
export function assetsDirs(pluginPath: string): string[] {
    return [path.join(dataDir, 'assets'), path.join(pluginPath, 'assets')];
}

/**
 * 把相对路径解析为实际存在的图片文件
 * 支持 dataPath/assets、插件目录 assets、dataPath 三级回退
 */
export function resolveAsset(relPath: string, pluginPath: string): string | null {
    const rel = relPath.trim().replace(/^file:\/\//, '').replace(/^[/\\]+/, '');
    const base = path.basename(rel);
    const candidates = [
        ...assetsDirs(pluginPath).map((d) => path.join(d, rel)),
        // 兼容旧文案里的 /config/tip.png：只取文件名去 assets 目录找
        ...assetsDirs(pluginPath).map((d) => path.join(d, base)),
        path.join(dataDir, rel),
        path.join(pluginPath, rel),
        path.join(dataDir, base),
        path.join(pluginPath, base),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    }
    return null;
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

/** 读取图片并转为 OneBot 标准 base64:// 形式，失败返回 null */
export function fileToBase64(absPath: string): string | null {
    const ext = path.extname(absPath).toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) return null;
    try {
        return `base64://${fs.readFileSync(absPath).toString('base64')}`;
    } catch {
        return null;
    }
}

import { Database, Download, RefreshCw, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { GroupPicker } from '@/components/GroupPicker';
import { Button } from '@/components/ui/button';
import { RowField } from '@/components/ui/label';
import { Panel, PanelHeader } from '@/components/ui/panel';
import { useStore } from '@/store';

function timeText(ts: number): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('zh-CN', {
        hour12: false,
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * 全局设置页：成员快照
 *
 * 只负责离线成员名单：导出 bot 已加入的群、下载备份、导入补数据、清理。
 * 「bot 不在」的群没法实时拉成员，只能用导入的名单参与查重；
 * 哪些群参与查重由「群配置 → 加群审核」决定。
 */
export function DupCheckPanel(): React.JSX.Element {
    const snapshot = useStore((s) => s.dupSnapshot);
    const exportSnapshot = useStore((s) => s.exportDupSnapshot);
    const downloadSnapshot = useStore((s) => s.downloadDupSnapshot);
    const importSnapshot = useStore((s) => s.importDupSnapshot);
    const clearSnapshot = useStore((s) => s.clearDupSnapshot);
    const refreshSnapshot = useStore((s) => s.refreshDupSnapshot);
    const askConfirm = useStore((s) => s.askConfirm);
    const toast = useStore((s) => s.toast);

    const [running, setRunning] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [scope, setScope] = useState<string[]>([]);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const runExport = async (): Promise<void> => {
        if (!scope.length) {
            toast('请先选择要导出的群', 'err');
            return;
        }
        setRunning(true);
        try {
            const result = await exportSnapshot(scope);
            if (!result) return;
            const failed = result.failed.length ? `，${result.failed.length} 个群失败` : '';
            toast(`已导出 ${result.groups} 个群 / ${result.members} 名成员${failed}`);
        } finally {
            setRunning(false);
        }
    };

    const runDownload = async (): Promise<void> => {
        setDownloading(true);
        try {
            await downloadSnapshot();
        } finally {
            setDownloading(false);
        }
    };

    const runImport = async (file: File): Promise<void> => {
        setRunning(true);
        try {
            await importSnapshot(await file.text());
        } finally {
            setRunning(false);
        }
    };

    const runClear = async (): Promise<void> => {
        const ok = await askConfirm(
            '清理成员快照',
            '确定删除数据目录里的成员快照文件？\n删除后 bot 不在的群将无法参与查重（可重新导入或导出恢复）。',
            'danger',
        );
        if (ok) await clearSnapshot();
    };

    return (
        <Panel>
            <PanelHeader
                icon={<Database className="size-4" />}
                title="成员快照"
                description="离线成员名单：加群审核的重复加群检测会优先读这份快照，快照里没有的群再实时拉取成员。"
            />

            <div className="space-y-5 p-5">
                <RowField
                    label="导出群范围"
                    hint="可多选；只能导出 bot 已加入的群。这里只是导出名单，是否参与查重由「群配置 → 加群审核」决定"
                >
                    <GroupPicker
                        selected={scope}
                        onChange={setScope}
                        triggerLabel="选择要导出的群"
                        emptyHint="还没有选择群 —— 选好群后点下方按钮导出。"
                    />
                </RowField>

                <RowField
                    label="离线快照"
                    hint="下载可留档 / 换机迁移；导入会给 bot 不在的群补充成员名单（同名群覆盖，其它群保留）"
                >
                    <div className="w-full max-w-[640px] space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" loading={running} onClick={() => void runExport()}>
                                {!running ? <Database className="size-3.5" /> : null}
                                导出选中群成员
                            </Button>
                            <Button
                                size="sm"
                                disabled={!snapshot?.exists}
                                loading={downloading}
                                onClick={() => void runDownload()}
                                title="把当前快照文件存到本地"
                            >
                                <Download className="size-3.5" />
                                下载
                            </Button>
                            <Button
                                size="sm"
                                disabled={running}
                                onClick={() => fileRef.current?.click()}
                                title="从本地快照文件恢复（覆盖当前快照）"
                            >
                                <Upload className="size-3.5" />
                                导入
                            </Button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="application/json,.json"
                                className="hidden"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    if (file) void runImport(file);
                                }}
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                disabled={!snapshot?.exists}
                                onClick={() => void runClear()}
                                title="删除数据目录里的快照文件"
                            >
                                <Trash2 className="size-3.5" />
                                清理
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => void refreshSnapshot()}
                                title="刷新快照状态"
                                aria-label="刷新快照状态"
                            >
                                <RefreshCw className="size-3.5" />
                            </Button>
                        </div>

                        {snapshot?.exists ? (
                            <p className="text-xs text-muted">
                                {timeText(snapshot.updatedAt)} 导出 · {snapshot.groups} 个群 ·{' '}
                                {snapshot.members} 名成员
                                {snapshot.stale ? (
                                    <span className="ml-2 inline-flex items-center gap-1">
                                        <span className="size-1.5 rounded-full border border-line-strong" />
                                        已超过 6 小时，建议重新导出
                                    </span>
                                ) : null}
                            </p>
                        ) : (
                            <p className="text-xs text-subtle">
                                还没有快照：可以导出 bot 已加入的群，也可以导入一份成员名单文件。
                            </p>
                        )}
                    </div>
                </RowField>

                <p className="rounded-control border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
                    bot 不在的群没法实时拉成员，只能靠导入的名单查重：先把该群的成员名单做成快照
                    （格式 <span className="font-mono-num">{'{ "groups": { "群号": ["QQ号", ...] } }'}</span>
                    ，或直接用「下载」拿到的文件改），导入后在「群配置 → 加群审核 → 参与查重的群」里勾上它即可。
                </p>
            </div>
        </Panel>
    );
}

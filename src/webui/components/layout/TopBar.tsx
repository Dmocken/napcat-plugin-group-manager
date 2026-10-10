import { RefreshCw, Save } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useStore, type PageKey } from '@/store';

const TITLES: Record<PageKey, { title: string; desc: string }> = {
    overview: { title: '概览', desc: '插件运行状态与各群功能总览' },
    global: { title: '全局设置', desc: '总开关、命令前缀、Bot 管理员与通用提示文案' },
    profiles: { title: '群配置', desc: '一条配置可绑定多个群，功能按配置独立生效' },
};

/** 吸顶顶栏：页面标题 + 保存状态 + 全局保存 / 刷新 */
export function TopBar(): React.JSX.Element {
    const page = useStore((s) => s.page);
    const dirty = useStore((s) => s.dirty);
    const saving = useStore((s) => s.saving);
    const lastSavedAt = useStore((s) => s.lastSavedAt);
    const save = useStore((s) => s.save);
    const load = useStore((s) => s.load);
    const askConfirm = useStore((s) => s.askConfirm);

    const meta = TITLES[page];

    const reload = async (): Promise<void> => {
        if (dirty) {
            const ok = await askConfirm('重新加载', '有未保存的修改，确定放弃并重新加载？');
            if (!ok) return;
        }
        void load();
    };

    return (
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-canvas/90 px-8 backdrop-blur">
            <div className="min-w-0 flex-1">
                <h1 className="text-[15px] leading-5 font-semibold text-ink">{meta.title}</h1>
                <p className="truncate text-[11px] leading-4 text-subtle">{meta.desc}</p>
            </div>

            <div className="flex shrink-0 items-center gap-3">
                <span className="flex items-center gap-2 text-[11px] text-subtle">
                    {dirty ? (
                        <>
                            <span className="size-1.5 rounded-full bg-inverse" />
                            <span className="text-ink-2">有未保存的修改</span>
                        </>
                    ) : lastSavedAt ? (
                        <>已保存 · {lastSavedAt}</>
                    ) : (
                        '尚未修改'
                    )}
                </span>

                <Button
                    variant="ghost"
                    size="iconSm"
                    title="重新加载"
                    aria-label="重新加载"
                    onClick={() => void reload()}
                >
                    <RefreshCw className="size-4" />
                </Button>

                <Button
                    variant="primary"
                    loading={saving}
                    disabled={!dirty}
                    onClick={() => void save()}
                >
                    <Save className="size-3.5" />
                    保存全部配置
                </Button>
            </div>
        </header>
    );
}
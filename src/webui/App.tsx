import { useEffect } from 'react';

import { ErrorBanner } from '@/components/layout/ErrorBanner';
import { SideNav } from '@/components/layout/SideNav';
import { PageSkeleton } from '@/components/layout/Skeletons';
import { TopBar } from '@/components/layout/TopBar';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PasswordDialog } from '@/components/PasswordDialog';
import { Toaster } from '@/components/Toaster';
import { GlobalSettingsPage } from '@/pages/GlobalSettingsPage';
import { OverviewPage } from '@/pages/OverviewPage';
import { ProfilesPage } from '@/pages/ProfilesPage';
import { useStore } from '@/store';

export function App(): React.JSX.Element {
    const load = useStore((s) => s.load);
    const save = useStore((s) => s.save);
    const page = useStore((s) => s.page);
    const meta = useStore((s) => s.meta);
    const dirty = useStore((s) => s.dirty);
    const saving = useStore((s) => s.saving);
    const refreshStatus = useStore((s) => s.refreshStatus);
    const refreshActivities = useStore((s) => s.refreshActivities);

    useEffect(() => {
        void load();
    }, [load]);

    // 运行数据实时同步：定时拉取 /status 与功能调用日志，
    // 标签页切到后台时暂停、回到前台立即补一次
    useEffect(() => {
        const INTERVAL = 5000;
        let timer = 0;
        const pull = (): void => {
            void refreshStatus();
            void refreshActivities();
        };
        const start = (): void => {
            window.clearInterval(timer);
            timer = window.setInterval(pull, INTERVAL);
        };

        start();
        const onVisibility = (): void => {
            window.clearInterval(timer);
            if (document.hidden) return;
            pull();
            start();
        };
        const onFocus = (): void => pull();

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onFocus);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onFocus);
        };
    }, [refreshStatus, refreshActivities]);

    // 关闭页面前提醒未保存
    useEffect(() => {
        const handler = (event: BeforeUnloadEvent): void => {
            if (!dirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);

    // Ctrl/⌘ + S 保存
    useEffect(() => {
        const handler = (event: KeyboardEvent): void => {
            if (!(event.ctrlKey || event.metaKey)) return;
            if (event.key.toLowerCase() !== 's') return;
            event.preventDefault();
            if (dirty && !saving) void save();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [dirty, saving, save]);

    return (
        <div className="flex h-screen overflow-hidden bg-canvas">
            <SideNav />

            <div className="flex min-w-0 flex-1 flex-col">
                <TopBar />
                <ErrorBanner />

                <main className="flex-1 overflow-y-auto">
                    <div key={page} className="gm-rise mx-auto max-w-[1240px] px-8 py-7">
                        {!meta ? (
                            <PageSkeleton />
                        ) : page === 'overview' ? (
                            <OverviewPage />
                        ) : page === 'global' ? (
                            <GlobalSettingsPage />
                        ) : (
                            <ProfilesPage />
                        )}
                    </div>
                </main>
            </div>

            <Toaster />
            <PasswordDialog />
            <ConfirmDialog />
        </div>
    );
}
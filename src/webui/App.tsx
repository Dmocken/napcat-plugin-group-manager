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

    useEffect(() => {
        void load();
    }, [load]);

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
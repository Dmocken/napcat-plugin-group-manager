import { User, Users, X } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

/** 腾讯公开头像接口：群 / QQ 用户 */
function avatarUrl(kind: 'group' | 'user', id: string): string {
    return kind === 'group'
        ? `https://p.qlogo.cn/gh/${id}/${id}/100`
        : `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=100`;
}

/** 圆形头像：加载失败（或没有号码）时退化成图标 */
export function IdentityAvatar({
    kind,
    id,
    className,
}: {
    /** group = QQ 群，user = QQ 用户 */
    kind: 'group' | 'user';
    /** 群号 / QQ 号 */
    id: string;
    className?: string;
}): React.JSX.Element {
    const [broken, setBroken] = useState(false);
    const Icon = kind === 'group' ? Users : User;

    if (broken || !id) {
        return (
            <span
                className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-subtle',
                    className,
                )}
            >
                <Icon className="size-3.5" />
            </span>
        );
    }

    return (
        <img
            src={avatarUrl(kind, id)}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className={cn(
                'size-7 shrink-0 rounded-full border border-line bg-surface-2 object-cover',
                className,
            )}
        />
    );
}

interface IdentityCellProps {
    /** group = QQ 群，user = QQ 用户 */
    kind: 'group' | 'user';
    /** 群号 / QQ 号；为空时渲染占位 */
    id: string;
    /** 群名 / 昵称；拿不到时只显示号码一行 */
    name?: string;
    className?: string;
}

/** 头像 + 两行身份信息：第一行名称、第二行号码 */
export function IdentityCell({ kind, id, name, className }: IdentityCellProps): React.JSX.Element {
    const showName = Boolean(name) && name !== id;

    return (
        <span
            className={cn('flex min-w-0 items-center gap-2', className)}
            title={name ? `${name}（${id}）` : id}
        >
            <IdentityAvatar kind={kind} id={id} />
            <span className="flex min-w-0 flex-col">
                {showName ? (
                    <span className="truncate text-[12px] leading-4 text-ink">{name}</span>
                ) : null}
                <span className="truncate font-mono-num text-[10px] leading-4 text-subtle">
                    {id || '—'}
                </span>
            </span>
        </span>
    );
}

interface IdentityCardProps {
    /** group = 群（左侧图标），user = QQ 用户（左侧 QQ 头像） */
    kind: 'group' | 'user';
    /** 群号 / QQ 号 */
    id: string;
    /** 群名 / QQ 昵称；拿不到（或与号码相同）时只显示号码一行 */
    name?: string;
    /** 传了才渲染右侧移除按钮 */
    onRemove?: () => void;
    className?: string;
}

/**
 * 双行身份卡片：左侧图标（群）或 QQ 头像（用户），
 * 右侧第一行名称、第二行号码。「绑定群」与「Bot 管理员」共用，保证两处样式一致。
 */
export function IdentityCard({
    kind,
    id,
    name,
    onRemove,
    className,
}: IdentityCardProps): React.JSX.Element {
    const showName = Boolean(name) && name !== id;

    return (
        <span
            className={cn(
                'flex min-w-0 items-center gap-2 rounded-panel border border-line bg-surface-2 py-1.5 pl-1.5',
                onRemove ? 'pr-1' : 'pr-2.5',
                className,
            )}
            title={showName ? `${name}（${id}）` : id || '—'}
        >
            {kind === 'group' ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-subtle">
                    <Users className="size-3.5" />
                </span>
            ) : (
                <IdentityAvatar kind="user" id={id} />
            )}
            <span className="flex min-w-0 flex-col">
                {showName ? (
                    <span className="truncate text-[12px] leading-4 text-ink">{name}</span>
                ) : null}
                <span className="truncate font-mono-num text-[10px] leading-4 text-subtle">
                    {id || '—'}
                </span>
            </span>
            {onRemove ? (
                <button
                    type="button"
                    aria-label="移除"
                    onClick={onRemove}
                    className="-mr-0.5 ml-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-full text-subtle transition-colors hover:bg-line hover:text-ink"
                >
                    <X className="size-3.5" />
                </button>
            ) : null}
        </span>
    );
}

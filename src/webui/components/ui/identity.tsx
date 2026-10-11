import { User, Users } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/utils';

interface IdentityCellProps {
    /** group = QQ 群，user = QQ 用户 */
    kind: 'group' | 'user';
    /** 群号 / QQ 号；为空时渲染占位 */
    id: string;
    /** 群名 / 昵称；拿不到时只显示号码一行 */
    name?: string;
    className?: string;
}

/** 腾讯公开头像接口；加载失败由 onError 兜底成图标 */
function avatarUrl(kind: 'group' | 'user', id: string): string {
    return kind === 'group'
        ? `https://p.qlogo.cn/gh/${id}/${id}/100`
        : `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=100`;
}

/** 头像 + 两行身份信息：第一行名称、第二行号码 */
export function IdentityCell({ kind, id, name, className }: IdentityCellProps): React.JSX.Element {
    const [broken, setBroken] = useState(false);
    const Icon = kind === 'group' ? Users : User;
    const showName = Boolean(name) && name !== id;

    return (
        <span className={cn('flex min-w-0 items-center gap-2', className)} title={name ? `${name}（${id}）` : id}>
            {broken || !id ? (
                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line bg-surface-2 text-subtle">
                    <Icon className="size-3.5" />
                </span>
            ) : (
                <img
                    src={avatarUrl(kind, id)}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() => setBroken(true)}
                    className="size-7 shrink-0 rounded-full border border-line bg-surface-2 object-cover"
                />
            )}
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

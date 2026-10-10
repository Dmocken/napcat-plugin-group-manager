import { CircleCheck, Plug, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { request } from '@/lib/api';
import type { AiTestResult, FeatureAction, FeatureMeta, FeatureSettings } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useStore } from '@/store';

/** 参数区底部的操作按钮，例如「测试 API Key」 */
function ActionRow({
    action,
    settings,
}: {
    action: FeatureAction;
    settings: FeatureSettings;
}): React.JSX.Element {
    const handleError = useStore((s) => s.handleError);
    const toast = useStore((s) => s.toast);
    const [running, setRunning] = useState(false);
    const [result, setResult] = useState<{ text: string; kind: 'ok' | 'err' | '' }>({
        text: '',
        kind: '',
    });

    const run = async (): Promise<void> => {
        if (action.key !== 'ai_test') {
            toast(`未实现的操作：${action.key}`, 'err');
            return;
        }

        // 用当前页面上的参数测试，不要求先保存
        const params = settings.params;
        setRunning(true);
        setResult({ text: '正在调用接口...', kind: '' });
        try {
            const data = await request<AiTestResult>('/ai/test', {
                method: 'POST',
                body: {
                    base_url: params.ai_base_url,
                    api_key: params.ai_api_key,
                    model: params.ai_model,
                    prompt: params.ai_prompt,
                    timeout_ms: params.ai_timeout_ms,
                },
            });
            const verdictText =
                data.verdict === null
                    ? '（没解析出 1/0，请检查提示词）'
                    : `（判定：${data.verdict ? '通过' : '拒绝'}）`;
            setResult({
                text: `调用成功，模型回复 ${JSON.stringify(data.reply)}${verdictText}`,
                kind: 'ok',
            });
            toast('AI 接口可用');
        } catch (error) {
            setResult({
                text: `调用失败：${error instanceof Error ? error.message : '未知错误'}`,
                kind: 'err',
            });
            handleError(error, 'AI 测试失败：');
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-2 px-3 py-2.5">
            <Button size="sm" loading={running} onClick={() => void run()}>
                <Plug className="size-3.5" />
                {action.label}
            </Button>
            <span className="flex min-w-0 items-center gap-1.5 text-xs">
                {result.text ? (
                    result.kind === 'err' ? (
                        <TriangleAlert className="size-3.5 shrink-0" />
                    ) : (
                        <CircleCheck className="size-3.5 shrink-0" />
                    )
                ) : null}
                <span
                    className={cn(
                        'min-w-0 break-all',
                        result.kind === 'err' ? 'text-ink' : 'text-muted',
                    )}
                >
                    {result.text || '用当前表单里的参数直接测试，不需要先保存'}
                </span>
            </span>
        </div>
    );
}

export function FeatureActions({
    meta,
    settings,
}: {
    meta: FeatureMeta;
    settings: FeatureSettings;
}): React.JSX.Element {
    return (
        <div className="space-y-2">
            {(meta.actions ?? []).map((action) => (
                <ActionRow key={action.key} action={action} settings={settings} />
            ))}
        </div>
    );
}

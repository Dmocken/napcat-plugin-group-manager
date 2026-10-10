import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { savePassword, savedPassword } from '@/lib/api';
import { useStore } from '@/store';

export function PasswordDialog(): React.JSX.Element {
    const open = useStore((s) => s.passwordOpen);
    const setOpen = useStore((s) => s.setPasswordOpen);
    const load = useStore((s) => s.load);

    const [value, setValue] = useState('');
    // 清除密码后需要重新计算提示文案
    const [, bumpVersion] = useState(0);

    const tip = savedPassword()
        ? '密码不正确，请重新输入。'
        : '该插件页面已设置访问密码，请输入后继续。';

    const submit = (): void => {
        savePassword(value);
        setValue('');
        setOpen(false);
        void load();
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <div className="p-5">
                    <DialogTitle>访问密码</DialogTitle>
                    <DialogDescription className="mt-1.5 mb-4">{tip}</DialogDescription>
                    <Field label="密码">
                        <Input
                            type="password"
                            autoComplete="current-password"
                            value={value}
                            onChange={(event) => setValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    submit();
                                }
                            }}
                        />
                    </Field>
                    <div className="mt-5 flex items-center gap-2">
                        <Button variant="underline" onClick={() => {
                            savePassword('');
                            bumpVersion((n) => n + 1);
                        }}>
                            清除已保存的密码
                        </Button>
                        <span className="flex-1" />
                        <Button variant="primary" onClick={submit}>
                            进入
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

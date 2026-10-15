/**
 * 群主 / 管理员本地记录的增量维护
 *
 * 不改变任何群内行为，只跟着群通知更新本地记录（供「AI 失败通知对象」与
 * 加群审核的通知目标校验使用）。feature 传 null：不受群功能开关限制，
 * 任何群的管理员变动都要记，否则本地记录会越来越偏。
 */

import { registerNotice } from '../core/events';
import { applyGroupAdminNotice, applyMemberDecreaseNotice } from '../services/group-managers';

/** 管理员被设置 / 撤销 */
registerNotice('group_admin', null, (c) => {
    applyGroupAdminNotice(c.event);
});

/** 管理员 / 群主退群、被踢 */
registerNotice('group_decrease', null, (c) => {
    applyMemberDecreaseNotice(c.event);
});

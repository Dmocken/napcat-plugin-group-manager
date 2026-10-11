/**
 * 构建时注入的常量（见 vite.webui.config.ts 的 define）
 */

/** git 短哈希；工作区有未提交改动时带「+」，取不到 git 时为 unknown */
declare const __BUILD_COMMIT__: string;

/** 构建时间 YYYY-MM-DD HH:mm */
declare const __BUILD_TIME__: string;

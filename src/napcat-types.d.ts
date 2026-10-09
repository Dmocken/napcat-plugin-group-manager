/**
 * NapCat 插件 API 类型声明
 *
 * 为什么自带声明而不是直接 import 'napcat-types'：
 *   napcat-types@0.0.17 发布包里的 .ts 源码存在语法残缺
 *   （napcat-core/packet/transformer/message/UploadForwardMsgV2.ts 第 10-19 行），
 *   一旦引用就会被 TypeScript 解析并报一堆与插件无关的错。
 *   这里按官方文档与源码，把插件开发用到的类型原样复制一份，做到零外部类型依赖。
 *
 * 运行时没有任何依赖：这些 import 都是 import type，编译后会被完全擦除。
 */

declare module 'napcat-types/napcat-onebot/network/plugin/types' {
    /** 配置项类型 */
    export interface PluginConfigItem {
        key: string;
        type: 'string' | 'number' | 'boolean' | 'select' | 'multi-select' | 'html' | 'text';
        label: string;
        description?: string;
        default?: unknown;
        options?: { label: string; value: string | number }[];
        placeholder?: string;
        reactive?: boolean;
        hidden?: boolean;
    }

    export type PluginConfigSchema = PluginConfigItem[];

    /** ctx.NapCatConfig 配置构建器 */
    export interface NapCatConfigClass {
        text(key: string, label: string, defaultValue?: string, description?: string, reactive?: boolean): PluginConfigItem;
        number(key: string, label: string, defaultValue?: number, description?: string, reactive?: boolean): PluginConfigItem;
        boolean(key: string, label: string, defaultValue?: boolean, description?: string, reactive?: boolean): PluginConfigItem;
        select(
            key: string,
            label: string,
            options: { label: string; value: string | number }[],
            defaultValue?: string | number,
            description?: string,
            reactive?: boolean,
        ): PluginConfigItem;
        multiSelect(
            key: string,
            label: string,
            options: { label: string; value: string | number }[],
            defaultValue?: (string | number)[],
            description?: string,
            reactive?: boolean,
        ): PluginConfigItem;
        html(content: string): PluginConfigItem;
        plainText(content: string): PluginConfigItem;
        combine(...items: PluginConfigItem[]): PluginConfigSchema;
    }

    export interface PluginHttpRequest {
        path: string;
        method: string;
        query: Record<string, string | string[] | undefined>;
        body: unknown;
        headers: Record<string, string | string[] | undefined>;
        params: Record<string, string>;
        raw: unknown;
    }

    export interface PluginHttpResponse {
        status(code: number): PluginHttpResponse;
        json(data: unknown): void;
        send(data: string | Buffer): void;
        setHeader(name: string, value: string): PluginHttpResponse;
        sendFile(filePath: string): void;
        redirect(url: string): void;
        raw: unknown;
    }

    export type PluginNextFunction = (err?: unknown) => void;

    export type PluginRequestHandler = (
        req: PluginHttpRequest,
        res: PluginHttpResponse,
        next: PluginNextFunction,
    ) => void | Promise<void>;

    export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'all';

    export interface PluginPageDefinition {
        path: string;
        title: string;
        icon?: string;
        htmlFile: string;
        description?: string;
    }

    export interface MemoryStaticFile {
        path: string;
        content: string | Buffer | (() => string | Buffer | Promise<string | Buffer>);
        contentType?: string;
    }

    export interface PluginRouterRegistry {
        api(method: HttpMethod, path: string, handler: PluginRequestHandler): void;
        get(path: string, handler: PluginRequestHandler): void;
        post(path: string, handler: PluginRequestHandler): void;
        put(path: string, handler: PluginRequestHandler): void;
        delete(path: string, handler: PluginRequestHandler): void;
        apiNoAuth(method: HttpMethod, path: string, handler: PluginRequestHandler): void;
        getNoAuth(path: string, handler: PluginRequestHandler): void;
        postNoAuth(path: string, handler: PluginRequestHandler): void;
        putNoAuth(path: string, handler: PluginRequestHandler): void;
        deleteNoAuth(path: string, handler: PluginRequestHandler): void;
        page(page: PluginPageDefinition): void;
        pages(pages: PluginPageDefinition[]): void;
        static(urlPath: string, localPath: string): void;
        staticOnMem(urlPath: string, files: MemoryStaticFile[]): void;
    }

    export interface PluginLogger {
        log(...args: unknown[]): void;
        debug(...args: unknown[]): void;
        info(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
    }

    export interface PluginEntry {
        id: string;
        fileId: string;
        name?: string;
        version?: string;
        description?: string;
        author?: string;
        pluginPath: string;
        entryPath?: string;
        enable: boolean;
        loaded: boolean;
    }

    export interface IPluginManager {
        readonly config: unknown;
        getPluginPath(): string;
        getPluginConfig(): Record<string, boolean>;
        getAllPlugins(): PluginEntry[];
        getLoadedPlugins(): PluginEntry[];
        getPluginInfo(pluginId: string): PluginEntry | undefined;
        setPluginStatus(pluginId: string, enable: boolean): Promise<void>;
        loadPluginById(pluginId: string): Promise<boolean>;
        unregisterPlugin(pluginId: string): Promise<void>;
        uninstallPlugin(pluginId: string, cleanData?: boolean): Promise<void>;
        reloadPlugin(pluginId: string): Promise<boolean>;
        loadDirectoryPlugin(dirname: string): Promise<void>;
        getPluginDataPath(pluginId: string): string;
        getPluginConfigPath(pluginId: string): string;
    }

    /** OneBot Action 调用：actions.call(action, params, adapterName, pluginManager.config) */
    export interface PluginActions {
        call(action: string, params: unknown, adapter: string, config: unknown): Promise<any>;
    }

    export interface PluginConfigUIController {
        updateSchema(schema: PluginConfigSchema): void;
        updateField(key: string, field: Partial<PluginConfigItem>): void;
        removeField(key: string): void;
        addField(field: PluginConfigItem, afterKey?: string): void;
        showField(key: string): void;
        hideField(key: string): void;
        getCurrentConfig(): Record<string, unknown>;
    }

    export interface NapCatPluginContext {
        core: unknown;
        oneBot: unknown;
        actions: PluginActions;
        pluginName: string;
        pluginPath: string;
        configPath: string;
        dataPath: string;
        NapCatConfig: NapCatConfigClass;
        adapterName: string;
        pluginManager: IPluginManager;
        logger: PluginLogger;
        router: PluginRouterRegistry;
        getPluginExports: <T = PluginModule>(pluginId: string) => T | undefined;
    }

    export type PluginEventContent = any;

    export interface PluginModule<T = PluginEventContent, C = unknown> {
        plugin_init: (ctx: NapCatPluginContext) => void | Promise<void>;
        plugin_onmessage?: (ctx: NapCatPluginContext, event: any) => void | Promise<void>;
        plugin_onevent?: (ctx: NapCatPluginContext, event: T) => void | Promise<void>;
        plugin_cleanup?: (ctx: NapCatPluginContext) => void | Promise<void>;
        plugin_config_schema?: PluginConfigSchema;
        plugin_config_ui?: PluginConfigSchema;
        plugin_get_config?: (ctx: NapCatPluginContext) => C | Promise<C>;
        plugin_set_config?: (ctx: NapCatPluginContext, config: C) => void | Promise<void>;
        plugin_config_controller?: (
            ctx: NapCatPluginContext,
            ui: PluginConfigUIController,
            initialConfig: Record<string, unknown>,
        ) => void | (() => void) | Promise<void | (() => void)>;
        plugin_on_config_change?: (
            ctx: NapCatPluginContext,
            ui: PluginConfigUIController,
            key: string,
            value: unknown,
            currentConfig: Record<string, unknown>,
        ) => void | Promise<void>;
    }
}

import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
import { Config as Config$1 } from "@deepseek-ai/dsh-bash-local";
import z from "@deepseek-ai/schemastery";
import "@deepseek-ai/dsh-subprocess";
import { Context, Volatile } from "@deepseek-ai/cordis";
import { ShellExecRequest, ShellExecSpec } from "@deepseek-ai/dsh-shell";
//#region src/shared/config.d.ts
/**
 * Host 与 Client 共用的配置值形状 (纯数据, 无 import).
 * @module dsh-load-shell-env/shared/config
 */
/** 流水线里的一级. */
interface StageConfig {
  /** 一条完整的 POSIX sh 命令行; 必须自己输出 NUL 分隔的 `KEY=VALUE`. */
  command: string;
  /** 省略时按 true 处理; 显式 false 表示这一级被留档但不参与读取. */
  enabled?: boolean;
}
//#endregion
//#region src/config.d.ts
/** 插件的完整配置: executor 的六个旋钮 + 环境同步自己的六个字段. */
interface ShellEnvConfig extends Config$1 {
  /** 总开关; 关闭时插件不执行任何命令, 也不注入任何东西. */
  enabled: Volatile<boolean>;
  /** 流水线; 逐级累积地读出 user 的 shell 环境. */
  stages: Volatile<StageConfig[]>;
  /** 允许从快照注入子进程的变量名白名单. */
  importNames: Volatile<string[]>;
  /** `.env` 风格的多行文本, 排在流水线之后. */
  customEnv: Volatile<string>;
  /** 每一级 stage 的超时 (毫秒), 与 executor 自己的 `timeoutMs` 不是一回事. */
  envTimeoutMs: Volatile<number>;
  /** 输出里不合约定的段是否按噪声丢弃 (默认关闭, 即严格模式). */
  filterNoise: Volatile<boolean>;
  /** 是否把注入层也交给终端进程 (界面内置终端与 agent 的 terminal 工具). */
  terminalEnv: Volatile<boolean>;
}
/**
 * 插件配置 schema.
 *
 * 注意 executor 的六个字段仍然在 schema 里 (否则 profile patch 写它们不生效),
 * 但它们**不出现在配置页上**: 替换掉内置 `bash-sandbox` 行之后, 官方那张 shell
 * 设置卡片会跟着退场, 需要调这些值的部署用 profile patch (README 有示例).
 */
export declare const Config: z<ShellEnvConfig>;
/** 配置校验失败; 消息里带字段名, 便于对着 profile patch 查. */
export declare class ShellEnvConfigError extends Error {
  constructor(message: string);
}
/**
 * 校验整个配置; 不合法就在加载时报出可操作的错误, 不静默跳过.
 *
 * 未启用的 stage 允许留空命令 (那正是"留档但不参与"的用法), 启用的那一级必须非空.
 * @param config - schema 解析后的活动配置.
 * @throws ShellEnvConfigError 指出字段与不合法的值.
 */
export declare function validateShellEnvConfig(config: ShellEnvConfig): void;
//#endregion
//#region src/shared/status.d.ts
/**
 * Host 与 Client 共用的状态契约.
 *
 * 这一份只能出现纯数据 (类型, 字面量), 不能 import 任何 node 或宿主包: Client
 * bundle 会把 `src/` 下的共享模块内联, 而浏览器里没有这些模块.
 * @module dsh-load-shell-env/shared/status
 */
/** 一次环境读取的生命周期阶段. */
type ShellEnvPhase =
/** 总开关关闭: 插件不执行任何命令, 也不注入任何东西. */
'disabled' |
/** 开关打开但还没有读过 (例如刚启动). */
'idle' |
/** 正在读. */
'reading' |
/** 最近一次读取成功. */
'ready' |
/** 最近一次读取失败, 快照保留上一次成功的结果. */
'failed';
/** 一次失败的原因摘要; 只有变量名与命令原文, 不含任何环境值. */
interface ShellEnvFailure {
  /** 失败的级号, 从 1 开始; 与具体级无关的失败 (配置错误) 没有这个字段. */
  stage?: number;
  /** 失败的那一级命令原文, 与 stage 同时出现. */
  command?: string;
  /** 脱敏后的一句话摘要. */
  message: string;
}
/** 终端进程继承的当前状态. */
interface ShellEnvTerminalStatus {
  /** 终端继承开关的当前值 (来自配置). */
  enabled: boolean;
  /** 包装是否装上了; `false` 表示这个组合里终端继承不可用. */
  hooked: boolean;
}
/**
 * 配置页读到的状态.
 *
 * 只有变量名清单, 没有变量值; 失败摘要也只保留 stderr 的尾部几行.
 */
interface ShellEnvStatus {
  /** 当前的读取阶段. */
  phase: ShellEnvPhase;
  /** 总开关的当前值 (来自配置). */
  enabled: boolean;
  /** 最近一次成功读取的时间 (ISO 字符串). */
  lastReadAt?: string;
  /** 最近一次读取耗时 (毫秒), 成功与失败都记. */
  durationMs?: number;
  /** 当前注入子进程的变量个数 (白名单命中与自定义 env 的并集). */
  importedCount: number;
  /** 当前注入子进程的变量名. */
  importedNames: string[];
  /** 打开输出容错时, 最近一次读取被当作噪声丢掉的段数; 严格模式下不出现. */
  skippedSegments?: number;
  /** 最近一次失败的原因. */
  error?: ShellEnvFailure;
  /** 终端继承的状态; 由 Host 半区附加, 快照自身不关心终端. */
  terminal?: ShellEnvTerminalStatus;
}
//#endregion
//#region src/routes.d.ts
/** 路由要读的状态面. */
interface ShellEnvRouteHost {
  /** 读当前状态 (无副作用). */
  status(): ShellEnvStatus;
  /** 手动重读一次并返回最新状态. */
  refresh(): Promise<ShellEnvStatus>;
}
//#endregion
//#region src/constants.d.ts
/**
 * 插件的公开标识符, 默认值与阈值.
 *
 * 这一份是 Host 与 Client 共同读取的常量来源: 两边都从包名, row id 与路由路径
 * 派生同一套字符串, 免得界面或日志里出现第二个写法.
 * @module dsh-load-shell-env/constants
 */
/** 包名: Client loader 的注册 id 与 `plugins.bundle.config` 槽位的键都用它. */
export declare const PACKAGE_NAME = "dsh-load-shell-env";
/** 插件模块名 (导出的 `name`), 也是 Loader row id 去掉 `dsh-` 前缀后的写法. */
export declare const PLUGIN_NAME = "load-shell-env";
/** 状态查询路由 (exact). */
export declare const STATUS_PATH = "/api/plugins/dsh-load-shell-env/status";
/** 手动刷新路由 (exact). */
export declare const REFRESH_PATH = "/api/plugins/dsh-load-shell-env/refresh";
//#endregion
//#region src/pipeline.d.ts
/** 流水线里的一级 (只含启用的级). */
interface PipelineStage {
  /** 这一级在配置页里的行号, 从 1 开始; 用于失败报告, 与显示的行号一致. */
  index: number;
  /** 完整的 POSIX sh 命令行. */
  command: string;
}
/** 跑一次流水线需要的东西. */
interface PipelineRequest {
  /** 按配置顺序排列的启用级. */
  stages: readonly PipelineStage[];
  /** 第一级看到的初始环境: Host 的继承环境 (已按 harness 规则过滤). */
  baseEnv: Record<string, string>;
  /** 每一级各自的超时 (毫秒). */
  timeoutMs: number;
  /** 上游取消信号. */
  signal?: AbortSignal | undefined;
  /** 输出里不合约定的段是否按噪声丢弃 (而不是让这一级失败). */
  filterNoise?: boolean | undefined;
}
/** 流水线成功的结果. */
interface PipelineResult {
  /** 最后一级的输出; 没有启用的级时为空映射. */
  env: Record<string, string>;
  /** 整条流水线的耗时 (毫秒). */
  durationMs: number;
  /** 实际执行了几级. */
  stageCount: number;
  /** 各级加起来被当作噪声丢掉的段数. */
  skipped: number;
}
//#endregion
//#region src/shell-env-store.d.ts
/** store 需要的日志面; 只保留实际用到的两个等级, 便于测试传入假 logger. */
interface ShellEnvLogger {
  info(message: string): void;
  warn(message: string): void;
}
/** 一次读取用的配置快照 (已归一化, 只含启用的级). */
interface ShellEnvReadConfig {
  /** 总开关. */
  enabled: boolean;
  /** 启用的级, 顺序即执行顺序; `index` 是配置页上的行号. */
  stages: readonly PipelineStage[];
  /** 允许从快照注入子进程的变量名. */
  importNames: readonly string[];
  /** `.env` 风格的自定义 env 文本. */
  customEnv: string;
  /** 每一级的超时 (毫秒). */
  envTimeoutMs: number;
  /** 输出里不合约定的段是否按噪声丢弃. */
  filterNoise: boolean;
}
/** store 的依赖; 除 readConfig 外都有默认实现, 测试可整块替换. */
interface ShellEnvStoreOptions {
  /** 读当前配置 (每次读取前调用, 保证拿到最新的 volatile 值). */
  readConfig: () => ShellEnvReadConfig;
  /** 第一级看到的初始环境; 默认 `scrubbedParentEnv()` 再补上 PATH 引导目录 (见 path-bootstrap). */
  baseEnv?: () => Record<string, string>;
  /** 跑流水线; 默认 {@link runPipeline}. */
  runPipeline?: (request: PipelineRequest) => Promise<PipelineResult>;
  /** 日志. */
  logger?: ShellEnvLogger;
  /** 当前时间, 便于测试. */
  now?: () => Date;
}
/** 手动刷新的触发来源, 只进日志. */
type ShellEnvTrigger = 'boot' | 'config' | 'manual';
//#endregion
//#region src/terminal-env.d.ts
/** 终端继承的开关与注入层来源; 两者都在每次 spawn 时重新读, 改动即时生效. */
interface TerminalEnvSource {
  /** 终端继承开关的当前值. */
  enabled(): boolean;
  /** 当前注入层; 值为 `undefined` 的条目是命令侧的删除语义 (见模块注释). */
  injection(): Record<string, string | undefined>;
}
/** 一个已安装的终端环境包装. */
interface TerminalEnvHook {
  /** 包装是否真的装上了; `false` 表示这个组合里终端继承不可用. */
  readonly hooked: boolean;
  /** 卸载并恢复原方法; 重复调用是空操作. */
  dispose(): void;
}
//#endregion
//#region src/index.d.ts
/** 插件模块名 (也是 Loader row id 去前缀后的写法). */
export declare const name = "load-shell-env";
/**
 * 环境同步与命令执行.
 *
 * 除了 `resolve()` 之外的行为都继承父类: 沙箱策略, 审批边界, 输出上限,
 * 后台进程管理一律不变.
 */
export declare class ShellEnvExecutor extends SandboxBashExecutor {
  readonly config: ShellEnvConfig;
  static inject: string[];
  static Config: typeof SandboxBashExecutor.Config;
  /**
   * 环境快照的状态面: 路由与外部诊断都通过它读状态, 触发重读.
   * 读取本身是单飞的, 重复调用只会复用同一次.
   */
  readonly shellEnv: ShellEnvRouteHost;
  private readonly store;
  /** 终端进程上的环境包装; 卸载插件时恢复 provider 的原方法. */
  private readonly terminalHook;
  /**
   * @param ctx - 宿主插件上下文.
   * @param config - schema 解析后的活动配置 (父类只认识 executor 那六个旋钮).
   */
  constructor(ctx: Context, config: ShellEnvConfig);
  /**
   * 把当前生效的注入层叠进解析后的 spec.
   *
   * 插件注入压过调用方显式传入的 `env`; `dshEnv` 仍然最高 (由 bash-local 的
   * spawnSpec 在更后面合并). 没有可注入的东西时原样返回父类结果.
   * @param request - 调用方的执行请求.
   * @returns 合并了环境层的执行规格.
   */
  resolve(request: ShellExecRequest): ShellExecSpec;
  /** 按最新配置同步一次: 关闭时清空, 打开时校验并重读. */
  private syncConfig;
}
//#endregion
export { type ShellEnvConfig, ShellEnvExecutor as default, type ShellEnvFailure, type ShellEnvPhase, type ShellEnvReadConfig, type ShellEnvStatus, type ShellEnvStoreOptions, type ShellEnvTerminalStatus, type ShellEnvTrigger, type StageConfig, type TerminalEnvHook, type TerminalEnvSource };
//# sourceMappingURL=index.d.mts.map
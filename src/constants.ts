/**
 * 插件的公开标识符, 默认值与阈值.
 *
 * 这一份是 Host 与 Client 共同读取的常量来源: 两边都从包名, row id 与路由路径
 * 派生同一套字符串, 免得界面或日志里出现第二个写法.
 * @module dsh-load-shell-env/constants
 */

/** 包名: Client loader 的注册 id 与 `plugins.bundle.config` 槽位的键都用它. */
export const PACKAGE_NAME = 'dsh-load-shell-env'

/** 插件模块名 (导出的 `name`), 也是 Loader row id 去掉 `dsh-` 前缀后的写法. */
export const PLUGIN_NAME = 'load-shell-env'

/** Loader row id: 配置表单寻址与 `configForms.whileServed` 都用它. */
export const ENTRY_ID = PLUGIN_NAME

/** locale 字典命名空间. */
export const LOCALE_NS = PLUGIN_NAME

/** 状态查询路由 (exact). */
export const STATUS_PATH = '/api/plugins/dsh-load-shell-env/status'

/** 手动刷新路由 (exact). */
export const REFRESH_PATH = '/api/plugins/dsh-load-shell-env/refresh'

/** 刷新请求必须带的自定义头, 只是防误触, 不是安全边界. */
export const REFRESH_HEADER = 'x-dsh-load-shell-env'

/** 刷新请求体的上限. */
export const MAX_REQUEST_BODY_BYTES = 4096

/** 每一级 stage 的默认超时 (毫秒). */
export const DEFAULT_ENV_TIMEOUT_MS = 10_000

/** 导入名单的默认值: 只把 PATH 带进子进程. */
export const DEFAULT_IMPORT_NAMES: readonly string[] = ['PATH']

/** 单个 stage 的 stdout 上限; 超过即按该级失败处理, 避免一份失控输出吃掉 Host 内存. */
export const MAX_STAGE_OUTPUT_BYTES = 4 * 1024 * 1024

/** 失败时保留的 stderr 尾部字节数. */
export const MAX_STAGE_STDERR_BYTES = 8 * 1024

/** 失败摘要里保留的 stderr 行数. */
export const STAGE_DIAGNOSTIC_LINES = 6

/** 合法的环境变量名. */
export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/** harness 自己占用的变量前缀; 插件不允许注入这个命名空间. */
export const DSH_ENV_PREFIX = 'DSH_'

/** 配置字段名 (Host schema, profile patch 与配置页共用). */
export const FIELD = {
  enabled: 'enabled',
  stages: 'stages',
  importNames: 'importNames',
  customEnv: 'customEnv',
  envTimeoutMs: 'envTimeoutMs',
  filterNoise: 'filterNoise',
} as const

/**
 * executor 自己继承来的六个字段, 用于超集 schema 与漂移检查.
 * 它们不出现在配置页上, 只在 profile patch 里调.
 */
export const EXECUTOR_FIELDS = [
  'cwd',
  'timeoutMs',
  'maxTimeoutMs',
  'maxOutputBytes',
  'maxSpillBytes',
  'graceMs',
] as const

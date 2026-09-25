/**
 * 插件的 Config schema 与配置校验.
 *
 * schema 必须是 `LocalBashExecutor.Config` 的超集: 自己定义 `static Config` 会遮蔽
 * 父类继承来的 schema, 而 schemastery 的 object 投影只走 schema 声明的键, 于是
 * `timeoutMs` 这类 executor 旋钮写进 profile patch 也会被静默丢掉. 六个继承字段
 * 直接取 `LocalBashExecutor.Config.dict` 里的子 schema 拼进来, 默认值与 volatile
 * 标记都跟着原版走 (漂移由单测盯住, 见 test/config.spec.ts).
 *
 * 我们的五个字段全部 volatile: 改配置不重挂载插件, 避免卸载期间 `ctx.shell`
 * 短暂缺位; 刷新逻辑统一走 `loader/volatile-update`.
 * @module dsh-load-shell-env/config
 */

import type { Volatile } from '@deepseek-ai/cordis'
import { LocalBashExecutor } from '@deepseek-ai/dsh-bash-local'
import type { Config as LocalBashConfig } from '@deepseek-ai/dsh-bash-local'
import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_ENV_TIMEOUT_MS, DEFAULT_IMPORT_NAMES, DSH_ENV_PREFIX, ENV_NAME_PATTERN,
} from './constants.ts'
import { parseCustomEnv } from './custom-env.ts'
import type { StageConfig } from './shared/config.ts'

export type { StageConfig } from './shared/config.ts'

/** 插件的完整配置: executor 的六个旋钮 + 环境同步自己的五个字段. */
export interface ShellEnvConfig extends LocalBashConfig {
  /** 总开关; 关闭时插件不执行任何命令, 也不注入任何东西. */
  enabled: Volatile<boolean>
  /** 流水线; 逐级累积地读出 user 的 shell 环境. */
  stages: Volatile<StageConfig[]>
  /** 允许从快照注入子进程的变量名白名单. */
  importNames: Volatile<string[]>
  /** `.env` 风格的多行文本, 排在流水线之后. */
  customEnv: Volatile<string>
  /** 每一级 stage 的超时 (毫秒), 与 executor 自己的 `timeoutMs` 不是一回事. */
  envTimeoutMs: Volatile<number>
  /** 输出里不合约定的段是否按噪声丢弃 (默认关闭, 即严格模式). */
  filterNoise: Volatile<boolean>
}

const BASE_FIELDS = LocalBashExecutor.Config.dict ?? {}

/**
 * 插件配置 schema.
 *
 * 注意 executor 的六个字段仍然在 schema 里 (否则 profile patch 写它们不生效),
 * 但它们**不出现在配置页上**: 替换掉内置 `bash-sandbox` 行之后, 官方那张 shell
 * 设置卡片会跟着退场, 需要调这些值的部署用 profile patch (README 有示例).
 */
export const Config = z.object({
  ...BASE_FIELDS,
  enabled: z.boolean().default(false).volatile(),
  stages: z.array(z.object({
    command: z.string(),
    enabled: z.boolean().default(true),
  })).default([]).volatile(),
  importNames: z.array(z.string()).default([...DEFAULT_IMPORT_NAMES]).volatile(),
  customEnv: z.string().default('').volatile(),
  envTimeoutMs: z.number().default(DEFAULT_ENV_TIMEOUT_MS).volatile(),
  filterNoise: z.boolean().default(false).volatile(),
}) as unknown as z<ShellEnvConfig>

/** 配置校验失败; 消息里带字段名, 便于对着 profile patch 查. */
export class ShellEnvConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ShellEnvConfigError'
  }
}

/**
 * 校验一个变量名是否可以出现在导入名单或自定义 env 里.
 * @param field - 出错的字段名, 用于组装消息.
 * @param name - 待校验的变量名.
 * @throws ShellEnvConfigError 名字不合法或落在 harness 自己的命名空间里.
 */
export function assertImportableName(field: string, name: string): void {
  if (!ENV_NAME_PATTERN.test(name)) {
    throw new ShellEnvConfigError(`${field}: "${name}" is not a valid environment variable name`)
  }
  if (name.startsWith(DSH_ENV_PREFIX)) {
    throw new ShellEnvConfigError(`${field}: "${name}" is reserved for the harness (DSH_* facts come from the dshEnv layer)`)
  }
}

/**
 * 只校验自定义 env 的变量名, 不关心值.
 * @param field - 出错的字段名.
 * @param text - `.env` 风格的多行文本.
 * @throws ShellEnvConfigError 文本不可解析, 或变量名不合法.
 */
export function assertCustomEnvNames(field: string, text: string): void {
  for (const assignment of parseCustomEnv(text)) assertImportableName(field, assignment.name)
}

/**
 * 校验整个配置; 不合法就在加载时报出可操作的错误, 不静默跳过.
 *
 * 未启用的 stage 允许留空命令 (那正是"留档但不参与"的用法), 启用的那一级必须非空.
 * @param config - schema 解析后的活动配置.
 * @throws ShellEnvConfigError 指出字段与不合法的值.
 */
export function validateShellEnvConfig(config: ShellEnvConfig): void {
  const timeout = config.envTimeoutMs.get()
  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new ShellEnvConfigError(`envTimeoutMs: expected a positive integer number of milliseconds, got ${String(timeout)}`)
  }
  for (const name of config.importNames.get()) assertImportableName('importNames', name)
  assertCustomEnvNames('customEnv', config.customEnv.get())
  const stages = config.stages.get()
  stages.forEach((stage, index) => {
    if (stage.enabled === false) return
    if (stage.command.trim() === '') {
      throw new ShellEnvConfigError(`stages/${String(index)}/command: an enabled stage must not be empty (disable it instead)`)
    }
  })
}

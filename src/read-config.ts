/**
 * 把插件自己的配置读成一次读取用的形状.
 *
 * 只保留启用的级, 但把行号记成**配置页上的行号** (1 起): 失败报告里的 "第 N 级"
 * 要能和 user 在界面上看到的行对上, 而不是只数启用过的行.
 * @module dsh-load-shell-env/read-config
 */

import type { ShellEnvConfig } from './config.ts'
import type { PipelineStage } from './pipeline.ts'
import type { ShellEnvReadConfig } from './shell-env-store.ts'

/**
 * 从活动配置里取出一份归一化的读取配置.
 * @param config - schema 解析后的活动配置.
 * @returns 供 store 使用的读取配置.
 */
export function readShellEnvConfig(config: ShellEnvConfig): ShellEnvReadConfig {
  const stages: PipelineStage[] = []
  config.stages.get().forEach((stage, offset) => {
    if (stage.enabled === false) return
    stages.push({ index: offset + 1, command: stage.command })
  })
  return {
    enabled: config.enabled.get(),
    stages,
    importNames: [...config.importNames.get()],
    customEnv: config.customEnv.get(),
    envTimeoutMs: config.envTimeoutMs.get(),
    filterNoise: config.filterNoise.get(),
  }
}

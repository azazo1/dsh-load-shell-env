/**
 * dsh-load-shell-env 的 Host 半区.
 *
 * 职责: 替换内置的 `bash-sandbox` 行 (`ctx.shell` 是单实现服务), 继承
 * `SandboxBashExecutor` 以保住 workspace-write / read-only 的文件边界与沙箱
 * 拒绝分类, 只在 `resolve()` 里把白名单快照与自定义 env 合并进 `spec.env`;
 * argv 仍然是 `bash -c <command>`, 命令文本一个字符都不改.
 *
 * 环境读取本身发生在 Host 进程 (不受 workspace-write 约束), 默认关闭, 只在
 * user 打开开关时执行 user 自己的 shell 配置.
 * @module dsh-load-shell-env
 */

import type { Context } from '@deepseek-ai/cordis'
// 只取类型: 这一份声明把 `loader/volatile-update` 事件并进 Context 的 Events.
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox'
import type { ShellExecRequest, ShellExecSpec } from '@deepseek-ai/dsh-shell'
import { Config, validateShellEnvConfig, type ShellEnvConfig } from './config.ts'
import { PLUGIN_NAME } from './constants.ts'
import { readShellEnvConfig } from './read-config.ts'
import { mountShellEnvRoutes, type ShellEnvRouteHost } from './routes.ts'
import { ShellEnvStore } from './shell-env-store.ts'

export { Config, ShellEnvConfigError, validateShellEnvConfig } from './config.ts'
export type { ShellEnvConfig, StageConfig } from './config.ts'
export { PACKAGE_NAME, PLUGIN_NAME, REFRESH_PATH, STATUS_PATH } from './constants.ts'
export type { ShellEnvStatus, ShellEnvPhase, ShellEnvFailure } from './shared/status.ts'
export type { ShellEnvReadConfig, ShellEnvStoreOptions, ShellEnvTrigger } from './shell-env-store.ts'

/** 插件模块名 (也是 Loader row id 去前缀后的写法). */
export const name = PLUGIN_NAME

/**
 * 环境同步与命令执行.
 *
 * 除了 `resolve()` 之外的行为都继承父类: 沙箱策略, 审批边界, 输出上限,
 * 后台进程管理一律不变.
 */
export class ShellEnvExecutor extends SandboxBashExecutor {
  static override inject = ['subprocess', 'sandbox', 'sandboxPolicy']

  // 自己定义 Config 会遮蔽父类继承来的 schema, 所以这里是 executor Config 的超集.
  static override Config = Config as unknown as typeof SandboxBashExecutor.Config

  /**
   * 环境快照的状态面: 路由与外部诊断都通过它读状态, 触发重读.
   * 读取本身是单飞的, 重复调用只会复用同一次.
   */
  readonly shellEnv: ShellEnvRouteHost

  private readonly store: ShellEnvStore

  /**
   * @param ctx - 宿主插件上下文.
   * @param config - schema 解析后的活动配置 (父类只认识 executor 那六个旋钮).
   */
  constructor(ctx: Context, override readonly config: ShellEnvConfig) {
    super(ctx, config)
    this.store = new ShellEnvStore({
      readConfig: () => readShellEnvConfig(config),
      logger: {
        info: message => { ctx.logger.info(message) },
        warn: message => { ctx.logger.warn(message) },
      },
    })
    try {
      validateShellEnvConfig(config)
    } catch (error: unknown) {
      // 打开着却配错了就是显式失败; 关着的时候只告警, 免得一个坏值把 Host 启动
      // 拖挂, 让 user 连界面都进不去改它.
      if (config.enabled.get()) throw error
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger.warn(`dsh-load-shell-env: disabled with an unusable configuration, staying inert: ${message}`)
    }
    this.store.applyConfig(readShellEnvConfig(config))
    this.shellEnv = {
      status: () => this.store.status(),
      refresh: () => this.store.refresh('manual'),
    }
    // 配置保存走 volatile 更新 (不重挂载), 由 store 决定清空还是重读.
    ctx.on('loader/volatile-update', () => { this.syncConfig() })
    // webServer 是可选依赖: 没有它的组合 (headless 等) 里插件照常注入环境, 只是没有配置页路由.
    ctx.inject(['webServer'], (webCtx) => {
      mountShellEnvRoutes(webCtx, this.shellEnv)
    })
  }

  /**
   * 把当前生效的注入层叠进解析后的 spec.
   *
   * 插件注入压过调用方显式传入的 `env`; `dshEnv` 仍然最高 (由 bash-local 的
   * spawnSpec 在更后面合并). 没有可注入的东西时原样返回父类结果.
   * @param request - 调用方的执行请求.
   * @returns 合并了环境层的执行规格.
   */
  override resolve(request: ShellExecRequest): ShellExecSpec {
    const spec = super.resolve(request)
    const injected = this.store.injectedEnv()
    if (Object.keys(injected).length === 0) return spec
    const env: Record<string, string | undefined> = { ...spec.env, ...injected }
    // tombstone (undefined) 由 subprocess seam 解释为"从子进程环境里删除该变量".
    return { ...spec, env: env as Record<string, string> }
  }

  /** 按最新配置同步一次: 关闭时清空, 打开时校验并重读. */
  private syncConfig(): void {
    if (!this.config.enabled.get()) {
      this.store.applyConfig(readShellEnvConfig(this.config))
      return
    }
    try {
      validateShellEnvConfig(this.config)
    } catch (error: unknown) {
      this.store.reportConfigError(error)
      return
    }
    this.store.applyConfig(readShellEnvConfig(this.config))
  }
}

export default ShellEnvExecutor

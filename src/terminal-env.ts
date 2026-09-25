/**
 * 终端进程的环境继承.
 *
 * desktop 内置终端 (界面右侧栏那个 xterm) 与 agent 的 terminal 工具都不经过
 * `ctx.shell`: `terminal-controller` 直接调 `ctx.subprocess.spawnTerminal()`, 环境
 * 只有 provider 的清理后继承环境加上一个 `DSH_SESSION_ID`; `terminal-bash` 也是同
 * 一条路. 所以这一层把 {@link ShellEnvStore} 的注入层合并进终端 spawn 的 `spec.env`.
 *
 * 为什么是运行期包装: DSH 没有给"终端用什么环境变量"留扩展点 —— `ctx.subprocess`
 * 是单实现服务 (再注册一个会抛), 而 `spawnTerminal` 的 spec 由调用方组装, 中间没有
 * 可插入的层. 插件能做的只有在加载期间包住这个实例方法, 卸载时恢复. 依赖的是公开
 * 契约而不是内部实现: `spawnTerminal(spec)` 的 `spec.env` 是"在 provider 的环境清理
 * 之后合并的显式条目".
 *
 * 合并顺序与命令侧一致: 注入层压过 `spec.env`. 代价是终端 backend 自己设的终端协议
 * 变量 (`TERM`/`PAGER`/`PS1`/`PROMPT_COMMAND`) 也会被盖掉, 其中 `PROMPT_COMMAND` 是
 * `terminal-bash` 判断命令是否结束的协议. 这里不做键保护, 而是由配置页提醒 user 不要
 * 把这些名字放进导入名单或自定义 env.
 *
 * 注入层里的 tombstone (自定义 env 的 `KEY=`) 在终端侧不生效: provider 的终端 spec
 * 只接受字符串值, 传 `undefined` 在 Windows 的 ConPTY 路径上没有删除语义, 所以跳过.
 * @module dsh-load-shell-env/terminal-env
 */

import type { SubprocessTerminalHandle, SubprocessTerminalSpawnSpec } from '@deepseek-ai/dsh-subprocess'

/** 终端继承的开关与注入层来源; 两者都在每次 spawn 时重新读, 改动即时生效. */
export interface TerminalEnvSource {
  /** 终端继承开关的当前值. */
  enabled(): boolean
  /** 当前注入层; 值为 `undefined` 的条目是命令侧的删除语义 (见模块注释). */
  injection(): Record<string, string | undefined>
}

/** 包装用的日志面; 只用到告警. */
export interface TerminalEnvLogger {
  warn(message: string): void
}

/** 一个已安装的终端环境包装. */
export interface TerminalEnvHook {
  /** 包装是否真的装上了; `false` 表示这个组合里终端继承不可用. */
  readonly hooked: boolean
  /** 卸载并恢复原方法; 重复调用是空操作. */
  dispose(): void
}

/** provider 上被包装的那一个方法; 真实实现是 `ctx.subprocess`. */
export interface TerminalSpawnProvider {
  spawnTerminal(spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle>
}

/**
 * 把注入层合并进一次终端 spawn 的 spec.
 *
 * 没有可注入的东西 (开关关闭, 或注入层为空) 时原样返回入参对象, 调用方拿到的还是
 * 原来那一个 spec. 合并时新建对象, 不改动入参; 同名的注入项压过调用方的 `spec.env`.
 * @param spec - 调用方组装好的终端 spec.
 * @param source - 开关与注入层.
 * @returns 合并了注入层的 spec.
 */
export function layerTerminalSpec(
  spec: SubprocessTerminalSpawnSpec,
  source: TerminalEnvSource,
): SubprocessTerminalSpawnSpec {
  if (!source.enabled()) return spec
  const overlay: Record<string, string> = {}
  for (const [name, value] of Object.entries(source.injection())) {
    if (value !== undefined) overlay[name] = value
  }
  if (Object.keys(overlay).length === 0) return spec
  return { ...spec, env: { ...spec.env, ...overlay } }
}

/**
 * 包装 provider 的 `spawnTerminal`, 让每次终端 spawn 都带上注入层.
 *
 * 安装后会自检一次 (写完读回), 确认实例方法确实被替换; 上游哪天把服务实例变成不可
 * 写, 这里会告警并返回 `hooked: false`, 而不是装作成功, 也不会把插件加载拖崩.
 * @param provider - 目标 provider (真实实现是 `ctx.subprocess`).
 * @param source - 开关与注入层.
 * @param logger - 告警出口.
 * @returns 包装句柄; 未装上时 `hooked` 为 false 且 `dispose` 是空操作.
 */
export function installTerminalEnvHook(
  provider: TerminalSpawnProvider,
  source: TerminalEnvSource,
  logger: TerminalEnvLogger,
): TerminalEnvHook {
  const original = provider.spawnTerminal
  if (typeof original !== 'function') {
    logger.warn('dsh-load-shell-env: the subprocess provider has no spawnTerminal method; terminal processes keep the inherited environment')
    return { hooked: false, dispose: () => {} }
  }
  const hadOwnProperty = Object.hasOwn(provider, 'spawnTerminal')
  const patched = function (this: unknown, spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    return original.call(provider, layerTerminalSpec(spec, source))
  }
  try {
    provider.spawnTerminal = patched
  } catch (error: unknown) {
    // 严格模式下给不可写属性赋值会抛; 那不是插件的失败, 只是这一层用不上.
    const message = error instanceof Error ? error.message : String(error)
    logger.warn(`dsh-load-shell-env: the subprocess provider rejects a wrapped spawnTerminal (${message}); terminal processes keep the inherited environment`)
    return { hooked: false, dispose: () => {} }
  }
  if (provider.spawnTerminal !== patched) {
    logger.warn('dsh-load-shell-env: the subprocess provider rejects a wrapped spawnTerminal; terminal processes keep the inherited environment')
    return { hooked: false, dispose: () => {} }
  }
  return {
    hooked: true,
    dispose: () => {
      // 别人在这之后又包了一层的话, 不要把人家的包装抹掉.
      if (provider.spawnTerminal !== patched) return
      if (hadOwnProperty) provider.spawnTerminal = original
      else Reflect.deleteProperty(provider, 'spawnTerminal')
    },
  }
}

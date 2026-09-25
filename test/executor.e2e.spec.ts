/**
 * 真实组合验证: 用真 provider (sandbox-local / sandbox-policy / subprocess-local) 与
 * session-projection 起一个宿主上下文, 把我们自己的 executor 挂成 `ctx.shell`.
 *
 * 单元测试与 mock context 不能替代这里: 要证明的是
 * (1) 继承来的 executor Config 在真实组合里仍然被解析,
 * (2) `resolve()` 注入的环境真的进了子进程, 而 argv 还是 `bash -c <command>`,
 * (3) 沙箱边界没有因为换 backend 而消失.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { SandboxUnavailableError } from '@deepseek-ai/dsh-sandbox'
import { LocalSandboxProvider } from '@deepseek-ai/dsh-sandbox-local'
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import type { ShellExecution, ShellExecSpec, ShellRunResult } from '@deepseek-ai/dsh-shell'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import { afterEach, describe, expect, it } from 'vitest'
import { ShellEnvExecutor } from '../src/index.ts'

const PLUGIN_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 需要回收的临时工作区. */
const workspaces: string[] = []
let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  rmSync(join(PLUGIN_ROOT, 'lse-e2e-denied.txt'), { force: true })
  for (const dir of workspaces.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** 起一个最小组合, 把我们自己的行挂成 shell backend. */
async function boot(options: {
  mode: 'read-only' | 'workspace-write' | 'danger-full-access'
  config?: Record<string, unknown>
}): Promise<{ ctx: Context, workspace: string, shell: ShellEnvExecutor }> {
  const workspace = mkdtempSync(join(tmpdir(), 'dsh-lse-e2e-'))
  workspaces.push(workspace)
  const context = new Context()
  await context.plugin(LocalSandboxProvider, {})
  await context.plugin(SessionProjectionRegistry)
  await context.plugin(SandboxPolicyService, { mode: options.mode, workspaceRoot: workspace })
  await context.plugin(LocalSubprocessRuntime)
  await context.plugin(ShellEnvExecutor, {
    cwd: workspace,
    timeoutMs: 30_000,
    graceMs: 1_000,
    ...options.config ?? {},
  })
  ctx = context
  return { ctx: context, workspace, shell: context.shell as ShellEnvExecutor }
}

/** 读一级 stage 输出的环境: 把继承来的 PATH 加上一个可识别的尾巴. */
const STAGE = [{ command: 'printf \'PATH=%s:/injected\\000\' "$PATH"' }]

/** 前后台统一的前台简写. */
async function run(executor: { execute(spec: ShellExecSpec): Promise<ShellExecution> }, spec: ShellExecSpec): Promise<ShellRunResult> {
  return (await executor.execute(spec)).result()
}

describe('真实组合里的 ShellEnvExecutor', () => {
  it('成为 ctx.shell 的提供者, 并把快照注入子进程 (argv 不变)', async () => {
    const { ctx: context, shell } = await boot({ mode: 'danger-full-access', config: { enabled: true, stages: STAGE } })
    expect(context.shell).toBeInstanceOf(ShellEnvExecutor)

    const status = await shell.shellEnv.refresh()
    expect(status).toMatchObject({ phase: 'ready', importedNames: ['PATH'], importedCount: 1 })

    const result = await run(shell, shell.resolve({ command: 'printf \'%s\\n\' "$PATH"' }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text).toContain('/injected')

    // argv 仍然是 bash -c: $0 是 bash, 命令文本一个字符都没改.
    const shellIdentity = await run(shell, shell.resolve({ command: 'printf \'%s|\' "$0"' }))
    expect(shellIdentity.stdout.text).toBe('bash|')
    expect(shell.resolve({ command: 'echo hi' }).command).toBe('echo hi')
  })

  it('没有读到时命令就用继承环境, 不阻塞也不失败', async () => {
    const { shell } = await boot({ mode: 'danger-full-access', config: { enabled: false, stages: STAGE } })
    expect(shell.shellEnv.status().phase).toBe('disabled')
    const result = await run(shell, shell.resolve({ command: 'printf ok' }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text).toBe('ok')
    expect(result.stdout.text).not.toContain('/injected')
  })

  it('仍然受 workspace-write 边界约束, 并照旧上报沙箱事实', async (testContext) => {
    const { shell } = await boot({ mode: 'workspace-write', config: { enabled: true, stages: STAGE } })
    await shell.shellEnv.refresh()
    // 换 backend 之后沙箱模式仍然是能力事实上报出去的那一个.
    expect(shell.sandboxMode).toBe('workspace-write')
    const deniedPath = join(PLUGIN_ROOT, 'lse-e2e-denied.txt')
    let result: ShellRunResult
    try {
      result = await run(shell, shell.resolve({ command: `printf x > ${JSON.stringify(deniedPath)}` }))
    } catch (error: unknown) {
      // 本机可能根本起不了 confinement runner (例如自己就跑在另一个 seatbelt 笼子里,
      // 嵌套 sandbox_apply 会被拒). 这与"边界消失"是两件事: 这里是显式拒绝执行, 而不是
      // 放手不带沙箱跑, 所以按环境不可用跳过, 与官方 e2e 的做法一致.
      if (error instanceof SandboxUnavailableError) {
        testContext.skip(`confinement runner unavailable here: ${error.message}`)
        return
      }
      throw error
    }
    expect(result.sandbox?.mode).toBe('workspace-write')
    expect(result.sandbox?.denied).toBe(true)
    expect(existsSync(deniedPath)).toBe(false)
  })

  it('自定义 env 与删除语义在真实命令里生效', async () => {
    const { shell } = await boot({
      mode: 'danger-full-access',
      config: {
        enabled: true,
        stages: STAGE,
        importNames: ['PATH'],
        customEnv: 'LSE_MARK=custom\nHOME=',
      },
    })
    await shell.shellEnv.refresh()
    const result = await run(shell, shell.resolve({ command: 'printf \'%s|%s\' "${LSE_MARK-unset}" "${HOME-unset}"' }))
    expect(result.exitCode).toBe(0)
    expect(result.stdout.text).toBe('custom|unset')
  })
})

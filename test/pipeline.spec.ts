import { describe, expect, it } from 'vitest'
import { PipelineError, runPipeline } from '../src/pipeline.ts'

/** 只含一条命令的流水线. */
function stages(...commands: string[]): { index: number, command: string }[] {
  return commands.map((command, index) => ({ index: index + 1, command }))
}

describe('runPipeline', () => {
  it('顺序累积: 第 N 级以第 N-1 级的输出当作自己的环境', async () => {
    const result = await runPipeline({
      stages: stages('printf "A=1\\000"', 'printf "B=%s\\000" "$A"'),
      baseEnv: { BASE: 'base' },
      timeoutMs: 5_000,
    })
    expect(result).toMatchObject({ env: { B: '1' }, stageCount: 2 })
  })

  it('上一级没输出的变量不会从继承环境里漏进下一级', async () => {
    const result = await runPipeline({
      stages: stages('printf "A=1\\000"', 'printf "B=%s\\000" "${BASE-unset}"'),
      baseEnv: { BASE: 'base' },
      timeoutMs: 5_000,
    })
    expect(result.env).toEqual({ B: 'unset' })
  })

  it('没有启用的级时快照为空, 不跑任何命令', async () => {
    const result = await runPipeline({ stages: [], baseEnv: { BASE: 'base' }, timeoutMs: 5_000 })
    expect(result).toEqual({ env: {}, durationMs: expect.any(Number), stageCount: 0, skipped: 0 })
  })

  it('退出码非 0 时按该行号失败, 并带上 stderr 尾部', async () => {
    const failure = await runPipeline({
      stages: stages('printf "A=1\\000"', 'echo "boom" >&2; exit 3'),
      baseEnv: {},
      timeoutMs: 5_000,
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PipelineError)
    const pipelineError = failure as PipelineError
    expect(pipelineError.stage).toBe(2)
    expect(pipelineError.command).toContain('exit 3')
    expect(pipelineError.kind).toBe('exit')
    expect(pipelineError.message).toContain('boom')
  })

  it('超时按该级失败', async () => {
    const failure = await runPipeline({
      stages: stages('sleep 5'),
      baseEnv: {},
      timeoutMs: 200,
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PipelineError)
    expect((failure as PipelineError).kind).toBe('timeout')
  })

  it('输出不符合约定时按该级失败', async () => {
    const failure = await runPipeline({
      stages: stages('echo "not-nul-separated"'),
      baseEnv: {},
      timeoutMs: 5_000,
    }).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(PipelineError)
    expect((failure as PipelineError).kind).toBe('invalid-output')
  })

  it('打开输出容错后, 混在 stdout 里的噪声不再让该级失败', async () => {
    const command = 'printf "Proxy on x set\\000A=1\\000"'
    const strict = await runPipeline({ stages: stages(command), baseEnv: {}, timeoutMs: 5_000 })
      .catch((error: unknown) => error)
    expect(strict).toBeInstanceOf(PipelineError)

    const tolerant = await runPipeline({ stages: stages(command), baseEnv: {}, timeoutMs: 5_000, filterNoise: true })
    expect(tolerant).toMatchObject({ env: { A: '1' }, skipped: 1 })
  })
})

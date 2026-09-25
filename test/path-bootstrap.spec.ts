import { describe, expect, it } from 'vitest'
import { withPathBootstrap } from '../src/path-bootstrap.ts'

describe('withPathBootstrap', () => {
  it('把缺失的引导目录按顺序放到最前面', () => {
    const env = withPathBootstrap({ PATH: '/usr/bin:/bin' }, ['/usr/local/bin', '/opt/homebrew/bin'], '/home/u')
    expect(env['PATH']).toBe('/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin')
  })

  it('已经在 PATH 里的目录不重复添加', () => {
    const env = withPathBootstrap({ PATH: '/opt/homebrew/bin:/usr/bin' }, ['/usr/local/bin', '/opt/homebrew/bin'], '/home/u')
    expect(env['PATH']).toBe('/usr/local/bin:/opt/homebrew/bin:/usr/bin')
  })

  it('按当前家目录展开 ~, 并且不改动原对象', () => {
    const source = { PATH: '/usr/bin' }
    const env = withPathBootstrap(source, ['~/.local/bin'], '/home/u')
    expect(env['PATH']).toBe('/home/u/.local/bin:/usr/bin')
    expect(source).toEqual({ PATH: '/usr/bin' })
    expect(env).not.toBe(source)
  })

  it('没有 PATH 时结果就是引导目录', () => {
    expect(withPathBootstrap({ HOME: '/home/u' }, ['/usr/local/bin'], '/home/u')).toEqual({
      HOME: '/home/u',
      PATH: '/usr/local/bin',
    })
  })

  it('不需要补任何东西时原样返回一份拷贝', () => {
    const env = withPathBootstrap({ PATH: '/usr/local/bin:/usr/bin' }, ['/usr/local/bin'], '/home/u')
    expect(env).toEqual({ PATH: '/usr/local/bin:/usr/bin' })
  })
})

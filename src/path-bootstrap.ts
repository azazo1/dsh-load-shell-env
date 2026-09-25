/**
 * 流水线的 PATH 引导.
 *
 * launchd 交给 GUI 应用的 `PATH` 通常只有 `/usr/bin:/bin:/usr/sbin:/sbin`, 连
 * `/usr/local/bin/fish` 都不在里面 —— 于是默认那一级 `fish -l -i -c 'env -0'`
 * 会因为找不到 fish 而直接失败, 而插件本身就是为了修这个环境才存在的. 所以给
 * **流水线**的初始环境补上几个约定俗成的用户工具链目录:
 *
 * - 只补 PATH 里还没有的那些, 顺序放在最前面 (用户配置里怎么写 PATH 仍然说了算);
 * - 只影响读取用的子进程, 不直接改注入结果: 快照仍然来自你的 shell 自己输出的东西,
 *   只是它现在能从这些目录里被找到.
 * @module dsh-load-shell-env/path-bootstrap
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * 引导目录: 常见于 macOS 上 brew, 手动安装的 fish, 以及用户级 CLI 的落点.
 * `~` 在运行时按当前 HOME 展开.
 */
export const PATH_BOOTSTRAP_DIRS: readonly string[] = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '~/.local/bin',
  '~/.bun/bin',
]

/**
 * 给一份环境补上 PATH 引导目录.
 *
 * @param env - 原始环境 (一般是 `scrubbedParentEnv()`).
 * @param dirs - 引导目录; 默认 {@link PATH_BOOTSTRAP_DIRS}.
 * @param home - 用于展开 `~` 的家目录; 默认 `os.homedir()`.
 * @returns 新的环境对象; 已经存在的目录不会重复添加.
 */
export function withPathBootstrap(
  env: Readonly<Record<string, string>>,
  dirs: readonly string[] = PATH_BOOTSTRAP_DIRS,
  home: string = homedir(),
): Record<string, string> {
  const current = (env['PATH'] ?? '').split(':').filter(entry => entry !== '')
  const present = new Set(current)
  const missing: string[] = []
  for (const dir of dirs) {
    const expanded = dir.startsWith('~/') ? join(home, dir.slice(2)) : dir
    if (present.has(expanded)) continue
    present.add(expanded)
    missing.push(expanded)
  }
  if (missing.length === 0) return { ...env }
  return { ...env, PATH: [...missing, ...current].join(':') }
}

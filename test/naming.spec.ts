/**
 * 公开标识符的一致性: package.json, 命名清单, bundle patch 与源码常量必须逐字对上.
 *
 * 客户端 loader 的注册 id 必须等于包名, 配置表单与 whileServed 寻址的是 Loader row id,
 * 路由是社区兼容性面; 任何一处不一致都会让半边静默缺席, 所以这里全部钉住.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ENTRY_ID, PACKAGE_NAME, REFRESH_PATH, STATUS_PATH } from '../src/constants.ts'
import { name as moduleName } from '../src/index.ts'

/** 读仓库根下的一个文件. */
function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), 'utf8')
}

/** 读一个 JSON 文件. */
function readJson<T>(relative: string): T {
  return JSON.parse(read(relative)) as T
}

interface PackageManifest {
  name: string
  main: string
  exports: Record<string, string>
  files: string[]
  dsh: { bundle: { patch: string }, client: { platform: string, inject: string[] } }
  peerDependencies: Record<string, string>
  devDependencies: Record<string, string>
}

interface NamingManifest {
  plugin: { packageName: string }
  names: {
    pluginNames: string[]
    loaderIds: string[]
    settingsNamespaces: string[]
    routes: { kind: string, path: string }[]
  }
}

describe('公开标识符', () => {
  it('包名, 模块名与 row id 与常量一致', () => {
    const manifest = readJson<PackageManifest>('package.json')
    expect(manifest.name).toBe(PACKAGE_NAME)
    expect(moduleName).toBe(ENTRY_ID)
  })

  it('命名清单里的 plugin / loader / 配置命名空间与路由与源码逐字一致', () => {
    const naming = readJson<NamingManifest>('dsh-plugin.naming.json')
    expect(naming.plugin.packageName).toBe(PACKAGE_NAME)
    expect(naming.names.pluginNames).toContain(ENTRY_ID)
    expect(naming.names.loaderIds).toEqual([ENTRY_ID])
    expect(naming.names.settingsNamespaces).toEqual([ENTRY_ID])
    expect(naming.names.routes).toEqual([
      { kind: 'exact', path: STATUS_PATH },
      { kind: 'exact', path: REFRESH_PATH },
    ])
  })

  it('package.json 的入口, 发布内容与 client 声明指向构建产物', () => {
    const manifest = readJson<PackageManifest>('package.json')
    expect(manifest.main).toBe('./lib/index.mjs')
    expect(manifest.exports['.']).toBe('./lib/index.mjs')
    expect(manifest.exports['./client']).toBe('./lib/client.js')
    expect(manifest.exports['./package.json']).toBe('./package.json')
    expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(manifest.dsh.client.platform).toBe('web')
    expect(manifest.dsh.client.inject).toContain('@deepseek-ai/dsh-client-ui-primitives')
    expect(manifest.files).toContain('lib')
  })

  it('peerDependencies 用版本范围而不是精确钉版本', () => {
    const manifest = readJson<PackageManifest>('package.json')
    const dshPeers = Object.entries(manifest.peerDependencies).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
    expect(dshPeers.length).toBeGreaterThan(0)
    for (const [name, range] of dshPeers) {
      expect(range, name).toMatch(/^>=0\.1\.7-rc\.2 <0\.2\.0$/)
      expect(manifest.devDependencies[name], name).toBe(range)
    }
  })
})

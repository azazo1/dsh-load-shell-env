/**
 * Client 半区入口: 在 Plugins 页的 dsh-load-shell-env 卡片上注册环境同步配置.
 *
 * 表单绑定 Host 的 `load-shell-env` 条目, 保存的值写进 profile 的 patch 层并由
 * `loader/volatile-update` 实时生效 (不重挂载插件, `ctx.shell` 不会短暂缺位).
 * 状态行与手动刷新走插件自己注册的两条 exact 路由.
 *
 * 构建产物是 CJS 形态的 loader 模块: tsdown 以 banner/footer 包裹为
 * `window.__ModuleLoader__.load({ id, factory: (require) => ... })`, react 与
 * ui-primitives 等平台模块经 factory 注入的 require 解析, 其余全部内联.
 * @module dsh-load-shell-env/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// 以下四个都是类型侧导入: 它们把 ctx.locale / ctx.configForms / ctx.slots 与
// `plugins.bundle.config` 槽位的类型并进 Context, 运行时不需要这些包.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { ENTRY_ID, LOCALE_NS, PACKAGE_NAME } from '../constants.ts'
import { ShellEnvSettingsCard } from './card.tsx'
import { en, zh } from './locales.ts'
import { ShellEnvSettingsForm, type ShellEnvSettings } from './settings-form.ts'
import { installStyles } from './styles.ts'

export type { ShellEnvCardFace, ShellEnvCardState, ShellEnvSettings } from './settings-form.ts'
export type { ShellEnvLocaleKey } from './locales.ts'

/** 页面依赖的服务: configForms 提供配置通道, slots 提供注册面, locale 提供文案. */
export const inject = ['configForms', 'slots', 'locale']

/**
 * 注册插件页的配置卡片.
 *
 * `whileServed` 与表单寻址用的是 Loader row id, 而 `plugins.bundle.config` 槽位的键
 * 是包名; Host 没有组合这一行时 (Windows 上就是这种情况) 卡片不出现.
 * @param ctx - 浏览器插件上下文.
 */
export function apply(ctx: ClientContext): void {
  installStyles()
  const t = ctx.locale.bind(LOCALE_NS)
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'dsh-load-shell-env: dictionaries')
  const form = new ShellEnvSettingsForm(ctx.configForms.get<ShellEnvSettings>(ENTRY_ID))
  ctx.effect(() => () => { form.dispose() }, 'dsh-load-shell-env: settings form')
  ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject(
    'plugins.bundle.config',
    () => ctx.slots.register({
      name: 'plugins.bundle.config',
      key: PACKAGE_NAME,
      inject: () => ({ ...form.inject(), t }),
    }, ShellEnvSettingsCard),
  )), 'dsh-load-shell-env: plugins page card')
}

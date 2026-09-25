/**
 * 配置卡片的暂存层.
 *
 * 官方 `SettingsFormModel` 的字段名只映射顶层一段路径, 而 `stages` 与
 * `importNames` 是数组, 用它寻址不到; 所以这一份自己管草稿, 保存时用一次原子写入
 * (`mutate([{ op: 'set' | 'unset', path: [...] }])`) 把全部改动落成 profile patch.
 *
 * 草稿分两种意图: `sets` 是显式写入的值, `unsets` 是显式要求从用户层删掉 (恢复默认
 * 时的语义, 让它重新继承组合层). 草稿只活在这张卡片所在的页面里: 离开页面就丢弃,
 * 只有保存才写入.
 * @module dsh-load-shell-env/client/settings-form
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  SettingsFormActions, SettingsFormPathOp, SettingsFormScope, SettingsFormShell,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  DEFAULT_ENV_TIMEOUT_MS, DEFAULT_IMPORT_NAMES, DSH_ENV_PREFIX, ENV_NAME_PATTERN, FIELD,
  REFRESH_HEADER, REFRESH_PATH, STATUS_PATH,
} from '../constants.ts'
import { parseCustomEnv } from '../custom-env.ts'
import type { StageConfig } from '../shared/config.ts'
import { initialStatus, type ShellEnvStatus } from '../shared/status.ts'

/** 卡片读到的配置形状 (就是 profile patch 里的那几个字段). */
export interface ShellEnvSettings {
  enabled?: boolean
  stages?: StageConfig[]
  importNames?: string[]
  customEnv?: string
  envTimeoutMs?: number
  filterNoise?: boolean
}

/** 流水线里的一行 (带渲染用的稳定 key). */
export interface EditableStage {
  key: string
  command: string
  enabled: boolean
}

/** 各字段的覆盖情况, 用于 `已覆盖` 标记. */
export interface ShellEnvOverrides {
  enabled: boolean
  stages: boolean
  importNames: boolean
  customEnv: boolean
  envTimeoutMs: boolean
  filterNoise: boolean
}

/** 卡片读到的整块状态. */
export interface ShellEnvCardState extends SettingsFormShell {
  enabled: boolean
  stages: EditableStage[]
  importNames: string[]
  customEnv: string
  envTimeoutMsText: string
  filterNoise: boolean
  /** 哪些字段在 profile 的用户层里被覆盖过. */
  overridden: ShellEnvOverrides
  /** 启用的级里有空命令. */
  stagesInvalid: boolean
  /** 自定义 env 的错误消息, 合法时是 undefined. */
  customEnvError: string | undefined
  /** 超时字段不合法. */
  envTimeoutInvalid: boolean
  /** Host 侧的状态 (阶段, 时间, 变量名, 失败摘要). */
  status: ShellEnvStatus
  /** 手动刷新是否在飞. */
  refreshing: boolean
  /** 状态请求本身的错误 (与 Host 侧读取失败不是一回事). */
  refreshError: string | undefined
}

/** 卡片注册时注入给组件的面. */
export interface ShellEnvCardFace extends SettingsFormActions {
  hooks: {
    /** 组件通过它读快照 (useShellEnvCard). */
    shellEnvCard: SnapshotStore<ShellEnvCardState>
  }
  /** 总开关. */
  setEnabled(next: boolean): void
  /** 在流水线末尾加一级. */
  addStage(): void
  /** 改某一级的命令. */
  updateStage(index: number, command: string): void
  /** 开关某一级. */
  toggleStage(index: number, enabled: boolean): void
  /** 删掉某一级. */
  removeStage(index: number): void
  /** 往导入名单里加一个名字; 不合法时返回 false. */
  addImportName(name: string): boolean
  /** 从导入名单里删掉一个名字. */
  removeImportName(name: string): void
  /** 改自定义 env 草稿. */
  editCustomEnv(text: string): void
  /** 改超时草稿. */
  editTimeoutText(text: string): void
  /** 开关输出容错. */
  setFilterNoise(next: boolean): void
  /** 读一次 Host 侧状态 (挂载时用). */
  refreshStatus(): void
  /** 手动触发一次环境读取. */
  refresh(): void
}

/** 草稿里可以显式写入的字段. */
interface FieldValues {
  enabled: boolean
  stages: StageConfig[]
  importNames: string[]
  customEnv: string
  envTimeoutMsText: string
  filterNoise: boolean
}

/** 字段名. */
type FieldName = keyof FieldValues

/** 状态轮询的间隔: 只在 Host 说"正在读"的时候用. */
const STATUS_POLL_MS = 700

/**
 * 把配置表单桥接成卡片需要的快照与动作.
 */
export class ShellEnvSettingsForm {
  private readonly store: SnapshotStore<ShellEnvCardState>
  private readonly unsubscribe: () => void
  private sets: Partial<FieldValues> = {}
  private readonly unsets = new Set<FieldName>()
  private baseline: number | undefined
  private saving = false
  private failed = false
  private disposed = false
  private status: ShellEnvStatus = initialStatus(false)
  private refreshing = false
  private refreshError: string | undefined
  private pollTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * @param scope - `ctx.configForms.get(ENTRY_ID)` 拿到的共享配置表单.
   */
  constructor(private readonly scope: SettingsFormScope<ShellEnvSettings>) {
    this.store = createSnapshotStore(this.projection())
    this.unsubscribe = scope.subscribe(() => { this.publish() })
  }

  /** 释放订阅与定时器. */
  dispose(): void {
    this.disposed = true
    this.unsubscribe()
    if (this.pollTimer !== undefined) clearTimeout(this.pollTimer)
  }

  /** 组装 slot 注册要注入的面. */
  inject(): ShellEnvCardFace {
    return {
      hooks: { shellEnvCard: this.store },
      setEnabled: (next) => { this.setField('enabled', next) },
      addStage: () => { this.setField('stages', [...this.stages(), { command: '', enabled: true }]) },
      updateStage: (index, command) => {
        this.setField('stages', this.stages().map((stage, at) => at === index ? { ...stage, command } : stage))
      },
      toggleStage: (index, enabled) => {
        this.setField('stages', this.stages().map((stage, at) => at === index ? { ...stage, enabled } : stage))
      },
      removeStage: (index) => { this.setField('stages', this.stages().filter((_, at) => at !== index)) },
      addImportName: (name) => {
        const trimmed = name.trim()
        if (!importableName(trimmed)) return false
        const names = this.importNames()
        this.setField('importNames', names.includes(trimmed) ? names : [...names, trimmed])
        return true
      },
      removeImportName: (name) => { this.setField('importNames', this.importNames().filter(entry => entry !== name)) },
      editCustomEnv: (text) => { this.setField('customEnv', text) },
      editTimeoutText: (text) => { this.setField('envTimeoutMsText', text) },
      setFilterNoise: (next) => { this.setField('filterNoise', next) },
      edit: (field, text) => {
        if (field === FIELD.customEnv) this.setField('customEnv', text)
        else if (field === FIELD.envTimeoutMs) this.setField('envTimeoutMsText', text)
      },
      resetField: (field) => {
        if (isFieldName(field)) this.unsetField(field)
      },
      refreshStatus: () => { this.readStatus() },
      refresh: () => { this.triggerRefresh() },
      save: () => { void this.save() },
      discard: () => { this.discard() },
    }
  }

  /** 丢掉全部草稿. */
  discard(): void {
    if (Object.keys(this.sets).length === 0 && this.unsets.size === 0 && !this.failed) return
    this.sets = {}
    this.unsets.clear()
    this.baseline = undefined
    this.failed = false
    this.publish()
  }

  /**
   * 把草稿写成一次原子写入.
   *
   * 只写真正改过的字段; 被拒绝时保留草稿, 让 user 接着改而不是重打一遍.
   */
  async save(): Promise<void> {
    const snapshot = this.scope.getSnapshot()
    const state = this.store.getSnapshot()
    if (this.saving || !snapshot.writable || !state.dirty || state.invalid) return
    const ops = this.pendingOps()
    if (ops.length === 0) return
    this.saving = true
    this.failed = false
    this.publish()
    try {
      const landed = await this.scope.mutate(ops, this.baseline ?? snapshot.revision)
      if (landed) {
        this.sets = {}
        this.unsets.clear()
        this.baseline = undefined
      }
      this.failed = !landed
    } catch {
      this.failed = true
    } finally {
      this.saving = false
      this.publish()
      // 保存会让 Host 重读一次环境; 顺手问一下状态, 让状态行跟上.
      if (!this.failed) this.readStatus()
    }
  }

  /** 读一次 Host 侧状态. */
  readStatus(): void {
    void this.request(STATUS_PATH, { method: 'GET' })
  }

  /** 手动刷新: 走插件自己的刷新路由, 单飞, 不排队. */
  triggerRefresh(): void {
    if (this.refreshing) return
    this.refreshing = true
    this.refreshError = undefined
    this.publish()
    void this.request(REFRESH_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [REFRESH_HEADER]: '1' },
      body: '{}',
    })
  }

  /** 发起一次状态请求并把结果推进 store. */
  private async request(path: string, init: RequestInit): Promise<void> {
    try {
      const response = await fetch(path, init)
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`)
      this.status = await response.json() as ShellEnvStatus
      this.refreshError = undefined
    } catch (error: unknown) {
      this.refreshError = error instanceof Error ? error.message : String(error)
    } finally {
      this.refreshing = false
      this.publish()
      this.schedulePoll()
    }
  }

  /** Host 还在读的时候轮询, 免得 user 盯着"正在读取"自己点刷新. */
  private schedulePoll(): void {
    if (this.disposed || this.status.phase !== 'reading' || this.pollTimer !== undefined) return
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined
      this.readStatus()
    }, STATUS_POLL_MS)
  }

  /** 显式写入一个字段的草稿. */
  private setField<K extends FieldName>(field: K, value: FieldValues[K]): void {
    this.unsets.delete(field)
    this.sets = { ...this.sets, [field]: value }
    this.touch()
  }

  /** 让一个字段回到组合层 (保存时 unset). */
  private unsetField(field: FieldName): void {
    const next = { ...this.sets }
    delete next[field]
    this.sets = next
    if (this.userLayerHas(field)) this.unsets.add(field)
    else this.unsets.delete(field)
    this.touch()
  }

  /** 记录一次草稿改动. */
  private touch(): void {
    this.baseline ??= this.scope.getSnapshot().revision
    this.failed = false
    this.publish()
  }

  /** 当前要显示的值: 草稿 > 恢复默认时回落到组合层 > 生效值. */
  private field<K extends FieldName>(name: K): FieldValues[K] {
    const staged = this.sets[name]
    if (staged !== undefined) return staged
    if (this.unsets.has(name)) return this.baseValue(name)
    return this.effectiveValue(name)
  }

  /** 当前生效值 (schema 默认已由 Host 解析进去). */
  private effectiveValue<K extends FieldName>(name: K): FieldValues[K] {
    const value = this.scope.getSnapshot().value
    switch (name) {
      case 'enabled': return (value?.enabled ?? false) as FieldValues[K]
      case 'stages': return (value?.stages ?? []) as FieldValues[K]
      case 'importNames': return (value?.importNames ?? [...DEFAULT_IMPORT_NAMES]) as FieldValues[K]
      case 'customEnv': return (value?.customEnv ?? '') as FieldValues[K]
      case 'envTimeoutMsText': return String(value?.envTimeoutMs ?? DEFAULT_ENV_TIMEOUT_MS) as FieldValues[K]
      case 'filterNoise': return (value?.filterNoise ?? false) as FieldValues[K]
    }
    /* v8 ignore next -- 上面的 case 覆盖了 FieldName 的全部取值 */
    throw new Error(`unknown field ${String(name)}`)
  }

  /** 组合层 (清掉用户层之后回落到的那一层) 的值. */
  private baseValue<K extends FieldName>(name: K): FieldValues[K] {
    const base = this.scope.getSnapshot().base as ShellEnvSettings | undefined
    switch (name) {
      case 'enabled': return (base?.enabled ?? false) as FieldValues[K]
      case 'stages': return (base?.stages ?? []) as FieldValues[K]
      case 'importNames': return (base?.importNames ?? [...DEFAULT_IMPORT_NAMES]) as FieldValues[K]
      case 'customEnv': return (base?.customEnv ?? '') as FieldValues[K]
      case 'envTimeoutMsText': return String(base?.envTimeoutMs ?? DEFAULT_ENV_TIMEOUT_MS) as FieldValues[K]
      case 'filterNoise': return (base?.filterNoise ?? false) as FieldValues[K]
    }
    /* v8 ignore next -- 上面的 case 覆盖了 FieldName 的全部取值 */
    throw new Error(`unknown field ${String(name)}`)
  }

  /** 用户层里是否有这个字段 (决定 `已覆盖` 与 unset 是否必要). */
  private userLayerHas(name: FieldName): boolean {
    const user = this.scope.getSnapshot().user
    if (user === null || typeof user !== 'object') return false
    const key = name === 'envTimeoutMsText' ? FIELD.envTimeoutMs : name
    return Object.hasOwn(user, key)
  }

  /** 流水线草稿. */
  private stages(): StageConfig[] {
    return this.field('stages')
  }

  /** 导入名单草稿. */
  private importNames(): string[] {
    return this.field('importNames')
  }

  /** 组装卡片读到的整块状态. */
  private projection(): ShellEnvCardState {
    const snapshot = this.scope.getSnapshot()
    const stages = this.stages()
    const importNames = this.importNames()
    const customEnv = this.field('customEnv')
    const timeoutText = this.field('envTimeoutMsText')
    const timeout = Number(timeoutText.trim())
    const envTimeoutInvalid = timeoutText.trim() === '' || !Number.isInteger(timeout) || timeout <= 0
    const stagesInvalid = stages.some(stage => stage.enabled !== false && stage.command.trim() === '')
    const customEnvError = customEnvProblem(customEnv)
    return {
      available: snapshot.status === 'ready',
      writable: snapshot.writable,
      dirty: this.pendingOps().length > 0,
      invalid: envTimeoutInvalid || stagesInvalid || customEnvError !== undefined,
      saving: this.saving,
      failed: this.failed,
      enabled: this.field('enabled'),
      stages: stages.map((stage, index) => ({
        key: `stage-${String(index)}`,
        command: stage.command,
        enabled: stage.enabled !== false,
      })),
      importNames: [...importNames],
      customEnv,
      envTimeoutMsText: timeoutText,
      filterNoise: this.field('filterNoise'),
      overridden: {
        enabled: this.userLayerHas('enabled'),
        stages: this.userLayerHas('stages'),
        importNames: this.userLayerHas('importNames'),
        customEnv: this.userLayerHas('customEnv'),
        envTimeoutMs: this.userLayerHas('envTimeoutMsText'),
        filterNoise: this.userLayerHas('filterNoise'),
      },
      stagesInvalid,
      customEnvError,
      envTimeoutInvalid,
      status: this.status,
      refreshing: this.refreshing,
      refreshError: this.refreshError,
    }
  }

  /** 当前草稿相对生效值需要写入的那些操作. */
  private pendingOps(): SettingsFormPathOp[] {
    const ops: SettingsFormPathOp[] = []
    for (const [name, value] of Object.entries(this.sets) as [FieldName, FieldValues[FieldName]][]) {
      const op = this.setOp(name, value)
      if (op !== undefined) ops.push(op)
    }
    for (const name of this.unsets) {
      if (!this.userLayerHas(name)) continue
      ops.push({ op: 'unset', path: [name === 'envTimeoutMsText' ? FIELD.envTimeoutMs : name] })
    }
    return ops
  }

  /** 一个显式写入的字段落成什么操作; 没有实际变化时是 undefined. */
  private setOp(name: FieldName, value: FieldValues[FieldName]): SettingsFormPathOp | undefined {
    const path = name === 'envTimeoutMsText' ? FIELD.envTimeoutMs : name
    if (name === 'envTimeoutMsText') {
      const parsed = Number(String(value).trim())
      if (!Number.isInteger(parsed) || parsed <= 0) return undefined
      return parsed === Number(this.effectiveValue('envTimeoutMsText')) ? undefined : { op: 'set', path: [path], value: parsed }
    }
    if (name === 'customEnv') {
      const text = String(value)
      if (text === this.effectiveValue('customEnv')) return undefined
      return text === '' ? { op: 'unset', path: [path] } : { op: 'set', path: [path], value: text }
    }
    if (name === 'stages') {
      const stages = (value as StageConfig[]).map(stage => ({ command: stage.command, enabled: stage.enabled !== false }))
      if (JSON.stringify(stages) === JSON.stringify(this.effectiveValue('stages'))) return undefined
      return { op: 'set', path: [path], value: stages }
    }
    if (JSON.stringify(value) === JSON.stringify(this.effectiveValue(name))) return undefined
    return { op: 'set', path: [path], value }
  }

  /** 通知组件状态变了. */
  private publish(): void {
    if (this.disposed) return
    this.store.set(this.projection())
  }
}

/** 是否是本卡片认识的字段名. */
function isFieldName(field: string): field is FieldName {
  return field === 'enabled' || field === 'stages' || field === 'importNames'
    || field === 'customEnv' || field === 'envTimeoutMsText' || field === 'filterNoise'
}

/** 自定义 env 的问题描述; 没问题时是 undefined. */
function customEnvProblem(text: string): string | undefined {
  if (text.trim() === '') return undefined
  try {
    for (const assignment of parseCustomEnv(text)) {
      if (!importableName(assignment.name)) return `"${assignment.name}" is not a usable variable name`
    }
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
  return undefined
}

/** 是否是能进导入名单或自定义 env 的名字. */
function importableName(name: string): boolean {
  return ENV_NAME_PATTERN.test(name) && !name.startsWith(DSH_ENV_PREFIX)
}

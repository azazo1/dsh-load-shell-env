/**
 * 卡片里的自绘控件.
 *
 * 官方字段控件只覆盖单行文本, 数字与密文三类, 布尔, 多行文本与列表需要自己画;
 * 这里复刻官方字段行的节奏 (标签 13px/500, 说明 12px tertiary, 每行 12px 内边距,
 * 行间 0.5px hairline), 并把 `已覆盖` 与 `恢复默认` 放在右侧.
 * @module dsh-load-shell-env/client/fields
 */

import { Button, Input, Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactNode } from 'react'
import type { EditableStage } from './settings-form.ts'

/** 一行字段的公共外壳. */
interface FieldRowProps {
  id?: string
  label: string
  hint?: string
  trailing?: ReactNode
  children: ReactNode
}

/** 一行字段的外壳. */
function FieldRow(props: FieldRowProps): ReactNode {
  return (
    <div className="dsh-lse-field">
      <div className="dsh-lse-head">
        <label className="dsh-lse-label" htmlFor={props.id}>{props.label}</label>
        {props.trailing === undefined ? null : <span className="dsh-lse-badges">{props.trailing}</span>}
      </div>
      {props.children}
      {props.hint === undefined ? null : <p className="dsh-lse-hint">{props.hint}</p>}
    </div>
  )
}

/** `已覆盖` 标记与 `恢复默认` 按钮. */
function OverrideTrailing(props: {
  overridden: boolean
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  onReset: () => void
}): ReactNode {
  if (!props.overridden) return null
  return (
    <>
      <span className="dsh-lse-overridden">{props.overriddenLabel}</span>
      <button type="button" className="dsh-lse-reset" disabled={props.disabled} onClick={props.onReset}>
        {props.resetLabel}
      </button>
    </>
  )
}

/** 布尔字段: 自绘行 + 官方 Switch. */
export function SwitchField(props: {
  id: string
  label: string
  hint?: string
  checked: boolean
  overridden: boolean
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  onToggle: (next: boolean) => void
  onReset: () => void
}): ReactNode {
  return (
    <FieldRow
      id={props.id}
      label={props.label}
      hint={props.hint}
      trailing={(
        <OverrideTrailing
          overridden={props.overridden}
          overriddenLabel={props.overriddenLabel}
          resetLabel={props.resetLabel}
          disabled={props.disabled}
          onReset={props.onReset}
        />
      )}
    >
      <div className="dsh-lse-switch-row">
        <Switch checked={props.checked} onChange={props.onToggle} label={props.label} disabled={props.disabled} />
      </div>
    </FieldRow>
  )
}

/** 多行文本字段. */
export function TextAreaField(props: {
  id: string
  label: string
  hint?: string
  placeholder?: string
  rows?: number
  text: string
  invalid: boolean
  error?: string | undefined
  overridden: boolean
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  onEdit: (text: string) => void
  onReset: () => void
}): ReactNode {
  return (
    <FieldRow
      id={props.id}
      label={props.label}
      hint={props.hint}
      trailing={(
        <OverrideTrailing
          overridden={props.overridden}
          overriddenLabel={props.overriddenLabel}
          resetLabel={props.resetLabel}
          disabled={props.disabled}
          onReset={props.onReset}
        />
      )}
    >
      <textarea
        id={props.id}
        className="dsh-lse-textarea"
        rows={props.rows ?? 6}
        value={props.text}
        placeholder={props.placeholder}
        aria-invalid={props.invalid}
        disabled={props.disabled}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      {props.invalid && props.error !== undefined ? <p className="dsh-lse-invalid">{props.error}</p> : null}
    </FieldRow>
  )
}

/** 数字字段: 自己画 input, 免得把文本草稿先变成数字. */
export function NumberField(props: {
  id: string
  label: string
  hint: string
  text: string
  invalid: boolean
  invalidLabel: string
  overridden: boolean
  overriddenLabel: string
  resetLabel: string
  disabled: boolean
  onEdit: (text: string) => void
  onReset: () => void
}): ReactNode {
  return (
    <FieldRow
      id={props.id}
      label={props.label}
      hint={props.hint}
      trailing={(
        <OverrideTrailing
          overridden={props.overridden}
          overriddenLabel={props.overriddenLabel}
          resetLabel={props.resetLabel}
          disabled={props.disabled}
          onReset={props.onReset}
        />
      )}
    >
      <Input
        id={props.id}
        className="dsh-lse-number"
        inputMode="numeric"
        value={props.text}
        aria-invalid={props.invalid}
        disabled={props.disabled}
        onChange={(event) => { props.onEdit(event.target.value) }}
      />
      {props.invalid ? <p className="dsh-lse-invalid">{props.invalidLabel}</p> : null}
    </FieldRow>
  )
}

/** 流水线: 每行一个命令输入 + 启用开关 + 删除按钮, 底部是"添加一级". */
export function StageList(props: {
  id: string
  label: string
  hint: string
  emptyLabel: string
  placeholder: string
  invalidLabel: string
  toggleLabel: string
  addLabel: string
  removeLabel: string
  stages: EditableStage[]
  invalid: boolean
  disabled: boolean
  onAdd: () => void
  onEdit: (index: number, command: string) => void
  onToggle: (index: number, enabled: boolean) => void
  onRemove: (index: number) => void
}): ReactNode {
  return (
    <FieldRow id={props.id} label={props.label} hint={props.hint}>
      <div className="dsh-lse-stages">
        {props.stages.length === 0 ? <p className="dsh-lse-hint">{props.emptyLabel}</p> : null}
        {props.stages.map((stage, index) => (
          <div className="dsh-lse-stage" key={stage.key}>
            <span className="dsh-lse-stage-index">{index + 1}</span>
            <Input
              className="dsh-lse-stage-input"
              value={stage.command}
              placeholder={props.placeholder}
              aria-label={`${props.label} ${String(index + 1)}`}
              disabled={props.disabled}
              onChange={(event) => { props.onEdit(index, event.target.value) }}
            />
            <Switch
              checked={stage.enabled}
              onChange={(next) => { props.onToggle(index, next) }}
              label={props.toggleLabel}
              disabled={props.disabled}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={props.disabled}
              aria-label={props.removeLabel}
              onClick={() => { props.onRemove(index) }}
            >
              ×
            </Button>
          </div>
        ))}
        {props.invalid ? <p className="dsh-lse-invalid">{props.invalidLabel}</p> : null}
        <div className="dsh-lse-actions">
          <Button variant="outline" size="sm" disabled={props.disabled} onClick={props.onAdd}>{props.addLabel}</Button>
        </div>
      </div>
    </FieldRow>
  )
}

/** 导入名单的 props. */
interface NameListProps {
  id: string
  label: string
  hint: string
  emptyLabel: string
  placeholder: string
  addLabel: string
  invalidLabel: string
  removeLabel: (name: string) => string
  names: string[]
  disabled: boolean
  onAdd: (name: string) => boolean
  onRemove: (name: string) => void
}

/** 导入名单: 一行 Tag, 一条新名字的输入框与添加按钮. */
export function NameList(props: NameListProps): ReactNode {
  const [draft, setDraft] = useState('')
  const [rejected, setRejected] = useState(false)
  const submit = (): void => {
    if (draft.trim() === '') return
    if (props.onAdd(draft)) {
      setDraft('')
      setRejected(false)
      return
    }
    setRejected(true)
  }
  return (
    <FieldRow id={props.id} label={props.label} hint={props.hint}>
      <div className="dsh-lse-names">
        <div className="dsh-lse-tags">
          {props.names.length === 0 ? <span className="dsh-lse-hint">{props.emptyLabel}</span> : null}
          {props.names.map(name => (
            <span className="dsh-lse-tag" key={name}>
              <Tag tone="neutral">{name}</Tag>
              <button
                type="button"
                className="dsh-lse-reset"
                aria-label={props.removeLabel(name)}
                disabled={props.disabled}
                onClick={() => { props.onRemove(name) }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="dsh-lse-name-add">
          <Input
            className="dsh-lse-name-input"
            value={draft}
            placeholder={props.placeholder}
            aria-label={props.label}
            aria-invalid={rejected}
            disabled={props.disabled}
            onChange={(event) => { setDraft(event.target.value); setRejected(false) }}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); submit() } }}
          />
          <Button variant="outline" size="sm" disabled={props.disabled} onClick={submit}>{props.addLabel}</Button>
        </div>
        {rejected ? <p className="dsh-lse-invalid">{props.invalidLabel}</p> : null}
      </div>
    </FieldRow>
  )
}

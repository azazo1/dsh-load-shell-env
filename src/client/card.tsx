/**
 * Plugins 页上 dsh-load-shell-env 卡片的配置页.
 *
 * 骨架用官方 `SettingsForm` (草稿, 保存与其它插件一致), 控件全部自绘; 状态区显示
 * Host 侧最近一次读取的时间, 耗时, 注入的变量名与失败摘要, 右侧是手动刷新.
 * @module dsh-load-shell-env/client/card
 */

import { Button, SettingsForm } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime, Translate } from '@deepseek-ai/dsh-client-ui-slots'
import { useEffect, type ReactNode } from 'react'
import { ENTRY_ID } from '../constants.ts'
import { NameList, NumberField, StageList, SwitchField, TextAreaField } from './fields.tsx'
import type { ShellEnvLocaleKey } from './locales.ts'
import type { ShellEnvCardFace, ShellEnvCardState } from './settings-form.ts'

/** 组件拿到的 props. */
export type ShellEnvSettingsCardProps =
  PropsRuntime<'plugins.bundle.config'>
  & InjectFace<ShellEnvCardFace>
  & {
    /** 本插件的文案. */
    t: Translate<ShellEnvLocaleKey>
  }

/**
 * 渲染卡片的简介或配置表单 (bundle 配置槽只会要 `page`, 简介分支是为了稳妥).
 * @param props - 视图, 表单快照与动作, 文案.
 * @returns 简介文本或配置表单.
 */
export function ShellEnvSettingsCard(props: ShellEnvSettingsCardProps): ReactNode {
  const { t } = props
  const state = props.useShellEnvCard(snapshot => snapshot)
  // 挂载时问一次 Host 侧状态; 组件自己不订阅外部数据, 只调用注入的动作.
  const refreshStatus = props.refreshStatus
  useEffect(() => { refreshStatus() }, [])
  if (props.view === 'summary') return t('description')

  const labels = {
    unavailable: t('formUnavailable'),
    readOnly: t('formReadOnly'),
    saveFailed: t('formSaveFailed'),
    save: t('save'),
    saving: t('saving'),
  }
  const locked = !state.writable
  // 总开关关闭时, 只有总开关与自定义 env 还能改.
  const pipelineLocked = locked || !state.enabled
  const overridden = { overriddenLabel: t('overridden'), resetLabel: t('reset') }

  return (
    <SettingsForm labels={labels} state={state} onSave={props.save} onDiscard={props.discard}>
      <SwitchField
        id="plugin-config-load-shell-env-enabled"
        label={t('enabled')}
        hint={t('enabledHint')}
        checked={state.enabled}
        overridden={state.overridden.enabled}
        disabled={locked}
        onToggle={props.setEnabled}
        onReset={() => { props.resetField('enabled') }}
        {...overridden}
      />
      <StageList
        id="plugin-config-load-shell-env-stages"
        label={t('stages')}
        hint={t('stagesHint')}
        emptyLabel={t('stageEmpty')}
        placeholder={t('stagePlaceholder')}
        invalidLabel={t('stagesInvalid')}
        toggleLabel={t('stageToggle')}
        addLabel={t('stageAdd')}
        removeLabel={t('stageRemove')}
        stages={state.stages}
        invalid={state.stagesInvalid}
        disabled={pipelineLocked}
        onAdd={props.addStage}
        onEdit={props.updateStage}
        onToggle={props.toggleStage}
        onRemove={props.removeStage}
      />
      <SwitchField
        id="plugin-config-load-shell-env-filter-noise"
        label={t('filterNoise')}
        hint={t('filterNoiseHint')}
        checked={state.filterNoise}
        overridden={state.overridden.filterNoise}
        disabled={pipelineLocked}
        onToggle={props.setFilterNoise}
        onReset={() => { props.resetField('filterNoise') }}
        {...overridden}
      />
      <NameList
        id="plugin-config-load-shell-env-names"
        label={t('importNames')}
        hint={t('importNamesHint')}
        emptyLabel={t('statusEmpty')}
        placeholder={t('importNamePlaceholder')}
        addLabel={t('importNameAdd')}
        invalidLabel={t('importNameInvalid')}
        removeLabel={name => t('importNameRemove', { name })}
        names={state.importNames}
        disabled={pipelineLocked}
        onAdd={props.addImportName}
        onRemove={props.removeImportName}
      />
      <NumberField
        id="plugin-config-load-shell-env-timeout"
        label={t('envTimeout')}
        hint={t('envTimeoutHint')}
        text={state.envTimeoutMsText}
        invalid={state.envTimeoutInvalid}
        invalidLabel={t('envTimeoutInvalid')}
        overridden={state.overridden.envTimeoutMs}
        disabled={pipelineLocked}
        onEdit={props.editTimeoutText}
        onReset={() => { props.resetField('envTimeoutMsText') }}
        {...overridden}
      />
      <TextAreaField
        id="plugin-config-load-shell-env-custom"
        label={t('customEnv')}
        hint={t('customEnvHint')}
        placeholder={t('customEnvPlaceholder')}
        rows={5}
        text={state.customEnv}
        invalid={state.customEnvError !== undefined}
        error={state.customEnvError === undefined ? undefined : t('customEnvInvalid', { message: state.customEnvError })}
        overridden={state.overridden.customEnv}
        disabled={locked}
        onEdit={props.editCustomEnv}
        onReset={() => { props.resetField('customEnv') }}
        {...overridden}
      />
      <StatusBlock t={t} state={state} onRefresh={props.refresh} />
      <section className="dsh-lse-section" aria-labelledby="plugin-config-load-shell-env-terminal">
        <h3 className="dsh-lse-section-title" id="plugin-config-load-shell-env-terminal">{t('terminalSection')}</h3>
        <NumberField
          id="plugin-config-load-shell-env-command-timeout"
          label={t('commandTimeout')}
          hint={t('commandTimeoutHint')}
          text={state.timeoutMsText}
          invalid={state.timeoutMsInvalid}
          invalidLabel={t('numberInvalid')}
          overridden={state.overridden.timeoutMs}
          disabled={locked}
          onEdit={props.editCommandTimeoutText}
          onReset={() => { props.resetField('timeoutMsText') }}
          {...overridden}
        />
        <NumberField
          id="plugin-config-load-shell-env-max-output"
          label={t('maxOutputBytes')}
          hint={t('maxOutputBytesHint')}
          text={state.maxOutputBytesText}
          invalid={state.maxOutputBytesInvalid}
          invalidLabel={t('numberInvalid')}
          overridden={state.overridden.maxOutputBytes}
          disabled={locked}
          onEdit={props.editMaxOutputBytesText}
          onReset={() => { props.resetField('maxOutputBytesText') }}
          {...overridden}
        />
      </section>
    </SettingsForm>
  )
}

/** 状态区: 阶段, 时间, 耗时, 变量名与失败摘要, 加一个手动刷新. */
function StatusBlock(props: { t: Translate<ShellEnvLocaleKey>, state: ShellEnvCardState, onRefresh: () => void }): ReactNode {
  const { t, state } = props
  const status = state.status
  const phase = {
    disabled: t('statusDisabled'),
    idle: t('statusIdle'),
    reading: t('statusReading'),
    ready: t('statusReady'),
    failed: t('statusFailed'),
  }[status.phase]
  return (
    <div className="dsh-lse-status" data-phase={status.phase} id={`plugin-config-${ENTRY_ID}-status`}>
      <div className="dsh-lse-head">
        <span className="dsh-lse-label">{t('statusTitle')}</span>
        <span className="dsh-lse-badges">
          <Button
            variant="outline"
            size="sm"
            disabled={state.refreshing || !state.enabled || !state.writable}
            onClick={props.onRefresh}
          >
            {state.refreshing ? t('refreshing') : t('refresh')}
          </Button>
        </span>
      </div>
      <p className="dsh-lse-status-line" role="status">{phase}</p>
      {status.lastReadAt === undefined ? null : (
        <p className="dsh-lse-hint">{t('statusLastRead', { time: formatTime(status.lastReadAt) })}</p>
      )}
      {status.durationMs === undefined ? null : (
        <p className="dsh-lse-hint">{t('statusDuration', { duration: String(status.durationMs) })}</p>
      )}
      <p className="dsh-lse-hint">
        {status.importedCount === 0
          ? t('statusEmpty')
          : t('statusImported', { count: String(status.importedCount), names: status.importedNames.join(', ') })}
      </p>
      {status.skippedSegments === undefined ? null : (
        <p className="dsh-lse-hint">{t('statusSkipped', { count: String(status.skippedSegments) })}</p>
      )}
      {status.error === undefined ? null : (
        <p className="dsh-lse-invalid">
          {status.error.stage === undefined
            ? status.error.message
            : t('statusError', { stage: String(status.error.stage), message: status.error.message })}
        </p>
      )}
      {state.refreshError === undefined ? null : (
        <p className="dsh-lse-invalid">{t('refreshFailed', { message: state.refreshError })}</p>
      )}
    </div>
  )
}

/** 把 ISO 时间转成本地可读文本. */
function formatTime(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString()
}

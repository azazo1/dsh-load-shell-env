/**
 * 配置页的文案字典.
 *
 * 所有 user 可见字符串都走 typed locale 字典: zh 是键的来源, en 必须与之同键,
 * 少一个或多一个都是编译错误.
 * @module dsh-load-shell-env/client/locales
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

/** 本插件的文案键. */
export type ShellEnvLocaleKey =
  | 'title'
  | 'description'
  | 'enabled'
  | 'enabledHint'
  | 'stages'
  | 'stagesHint'
  | 'stagePlaceholder'
  | 'stageToggle'
  | 'stageAdd'
  | 'stageRemove'
  | 'stageEmpty'
  | 'stagesInvalid'
  | 'importNames'
  | 'importNamesHint'
  | 'importNamePlaceholder'
  | 'importNameAdd'
  | 'importNameRemove'
  | 'importNameInvalid'
  | 'customEnv'
  | 'customEnvHint'
  | 'customEnvPlaceholder'
  | 'customEnvInvalid'
  | 'envTimeout'
  | 'envTimeoutHint'
  | 'envTimeoutInvalid'
  | 'filterNoise'
  | 'filterNoiseHint'
  | 'terminalSection'
  | 'commandTimeout'
  | 'commandTimeoutHint'
  | 'maxOutputBytes'
  | 'maxOutputBytesHint'
  | 'numberInvalid'
  | 'statusTitle'
  | 'statusDisabled'
  | 'statusIdle'
  | 'statusReading'
  | 'statusReady'
  | 'statusFailed'
  | 'statusLastRead'
  | 'statusDuration'
  | 'statusImported'
  | 'statusEmpty'
  | 'statusSkipped'
  | 'statusError'
  | 'refresh'
  | 'refreshing'
  | 'refreshFailed'
  | 'overridden'
  | 'reset'
  | 'formUnavailable'
  | 'formReadOnly'
  | 'formSaveFailed'
  | 'save'
  | 'saving'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-load-shell-env 配置页的文案. */
    'load-shell-env': ShellEnvLocaleKey
  }
}

/** 中文文案. */
export const zh: Record<ShellEnvLocaleKey, string> = {
  title: 'Shell 环境同步',
  description: '把你自己的 shell 环境 (PATH 等) 带进 agent 的命令.',
  enabled: '启用',
  enabledHint: '打开并保存后, 插件才会执行下面的流水线去读你的 shell 环境; 关闭时命令立刻回到继承环境.',
  stages: '读取流水线',
  stagesHint: '按顺序累积执行: 第 N 级用第 N-1 级的输出当自己的环境. 每一级必须自己输出 NUL 分隔的 KEY=VALUE, 例如 fish -l -i -c "env -0".',
  stagePlaceholder: '一条完整的 sh 命令行, 例如 fish -l -i -c "env -0"',
  stageToggle: '启用这一级',
  stageAdd: '添加一级',
  stageRemove: '删除这一级',
  stageEmpty: '还没有任何一级; 这时只有自定义 env 生效.',
  stagesInvalid: '启用的级不能是空命令; 不想要它就关掉这一级.',
  importNames: '导入名单',
  importNamesHint: '只把这些变量名从快照注入子进程. 默认只有 PATH; 不要放 DSH_ 前缀, 那是 harness 自己的命名空间.',
  importNamePlaceholder: '变量名, 例如 PATH',
  importNameAdd: '添加',
  importNameRemove: '移除 {name}',
  importNameInvalid: '变量名不合法, 或落在 DSH_ 命名空间里.',
  customEnv: '自定义 env',
  customEnvHint: '每行一条 KEY=VALUE, 支持 $VAR / ${VAR} 展开与 \\$ 转义; KEY= 表示从命令环境里删除该变量. 这一层排在流水线之后.',
  customEnvPlaceholder: 'PATH=$PATH:$HOME/.local/bin',
  customEnvInvalid: '自定义 env 不合法: {message}',
  envTimeout: '每级超时 (毫秒)',
  envTimeoutHint: '每一级各自计时; 超时即整次读取失败, 并保留上一次成功的快照.',
  envTimeoutInvalid: '请填一个正整数毫秒值.',
  filterNoise: '输出容错',
  filterNoiseHint: '遇到不符合 KEY=VALUE 约定的输出段时, 丢弃它并继续 (状态行会报告丢了几段), 而不是让这一级失败. 它只能救回"噪声黏在变量名前面"这种形态; 噪声如果糊进了值里, 任何解析器都看不出来, 只能从源头把消息改成写 stderr.',
  terminalSection: '终端',
  commandTimeout: '命令超时 (毫秒)',
  commandTimeoutHint: '单条命令允许运行多久, 超时即终止.',
  maxOutputBytes: '单流输出上限 (字节)',
  maxOutputBytesHint: '超出部分会转存到临时文件, 而不是被丢弃.',
  numberInvalid: '请填一个正整数.',
  statusTitle: '状态',
  statusDisabled: '未启用',
  statusIdle: '尚未读取',
  statusReading: '正在读取...',
  statusReady: '上次读取成功',
  statusFailed: '上次读取失败',
  statusLastRead: '读取时间: {time}',
  statusDuration: '耗时: {duration} ms',
  statusImported: '已导入 {count} 个变量: {names}',
  statusEmpty: '没有导入任何变量.',
  statusSkipped: '读取时丢弃了 {count} 段不符合约定的输出 (输出容错已打开).',
  statusError: '第 {stage} 级失败: {message}',
  refresh: '刷新',
  refreshing: '读取中...',
  refreshFailed: '状态请求没有成功: {message}',
  overridden: '已覆盖',
  reset: '恢复默认',
  formUnavailable: '该插件当前未加载, 暂时无法配置.',
  formReadOnly: '本部署的设置为只读.',
  formSaveFailed: '本部署没有接受这些值, 已保留供你修改.',
  save: '保存',
  saving: '保存中...',
}

/** 英文文案. */
export const en: Record<ShellEnvLocaleKey, string> = {
  title: 'Shell environment sync',
  description: 'Bring your own shell environment (PATH and friends) into agent commands.',
  enabled: 'Enable',
  enabledHint: 'Only after you turn this on and save does the plugin run the pipeline below against your shell environment; turning it off returns commands to the inherited environment immediately.',
  stages: 'Read pipeline',
  stagesHint: 'Stages accumulate in order: stage N runs with stage N-1 output as its environment. Each stage must print NUL-separated KEY=VALUE itself, for example fish -l -i -c "env -0".',
  stagePlaceholder: 'A complete sh command line, e.g. fish -l -i -c "env -0"',
  stageToggle: 'Enable this stage',
  stageAdd: 'Add a stage',
  stageRemove: 'Remove this stage',
  stageEmpty: 'No stages yet; only the custom env below applies.',
  stagesInvalid: 'An enabled stage must not be empty; disable it instead.',
  importNames: 'Import names',
  importNamesHint: 'Only these names are injected into child processes from the snapshot. The default is PATH alone; never use the DSH_ prefix, that namespace belongs to the harness.',
  importNamePlaceholder: 'Variable name, e.g. PATH',
  importNameAdd: 'Add',
  importNameRemove: 'Remove {name}',
  importNameInvalid: 'Not a valid variable name, or it belongs to the DSH_ namespace.',
  customEnv: 'Custom env',
  customEnvHint: 'One KEY=VALUE per line, with $VAR / ${VAR} expansion and \\$ escapes; KEY= removes that variable from the command environment. This layer applies after the pipeline.',
  customEnvPlaceholder: 'PATH=$PATH:$HOME/.local/bin',
  customEnvInvalid: 'Custom env is not usable: {message}',
  envTimeout: 'Per-stage timeout (ms)',
  envTimeoutHint: 'Each stage is timed on its own; a timeout fails the whole read and keeps the last successful snapshot.',
  envTimeoutInvalid: 'Enter a positive whole number of milliseconds.',
  filterNoise: 'Tolerate output noise',
  filterNoiseHint: 'Drop output segments that do not follow the KEY=VALUE convention and keep going (the status row reports how many were dropped) instead of failing the stage. It only recovers the "noise glued in front of a variable name" shape; noise written into a value is invisible to any parser, so fix the message at its source instead (write it to stderr).',
  terminalSection: 'Shell',
  commandTimeout: 'Command timeout (ms)',
  commandTimeoutHint: 'How long one command may run before it is terminated.',
  maxOutputBytes: 'Output cap per stream (bytes)',
  maxOutputBytesHint: 'Output beyond this spills to a temporary file rather than being lost.',
  numberInvalid: 'Enter a positive whole number.',
  statusTitle: 'Status',
  statusDisabled: 'Disabled',
  statusIdle: 'Not read yet',
  statusReading: 'Reading...',
  statusReady: 'Last read succeeded',
  statusFailed: 'Last read failed',
  statusLastRead: 'Read at {time}',
  statusDuration: 'Took {duration} ms',
  statusImported: 'Injected {count} variable(s): {names}',
  statusEmpty: 'No variables injected.',
  statusSkipped: 'Dropped {count} output segment(s) that did not follow the convention (output tolerance is on).',
  statusError: 'Stage {stage} failed: {message}',
  refresh: 'Refresh',
  refreshing: 'Reading...',
  refreshFailed: 'Status request failed: {message}',
  overridden: 'Overridden',
  reset: 'Reset',
  formUnavailable: 'This plugin is not loaded right now, so it cannot be configured.',
  formReadOnly: 'This deployment stores settings read-only.',
  formSaveFailed: 'This deployment did not accept these values; they are kept for you to fix.',
  save: 'Save',
  saving: 'Saving...',
}

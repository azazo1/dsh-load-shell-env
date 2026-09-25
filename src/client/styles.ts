/**
 * 卡片样式.
 *
 * 只用 `--dsw-alias-*` 语义 token, 行节奏对齐官方设置页 (标签 13px/500, 说明 12px
 * tertiary, 每行 12px 内边距, 行间 0.5px hairline). 外部插件的 tsdown 构建里没有
 * CSS Modules 预设, 所以这里用 `data-plugin-css` 标记注入一次, 与官方预设的去重
 * 标记同一个键.
 * @module dsh-load-shell-env/client/styles
 */

const STYLE_ID = 'dsh-load-shell-env-card'

const CSS_TEXT = `
.dsh-lse-field { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
.dsh-lse-field + .dsh-lse-field { border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-lse-head { display: flex; align-items: center; gap: 8px; }
.dsh-lse-label { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsh-alias-label-primary); }
.dsh-lse-badges { display: inline-flex; align-items: center; gap: 8px; }
.dsh-lse-overridden { font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
.dsh-lse-reset { padding: 0; border: none; background: none; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; line-height: 1.5; cursor: pointer; }
.dsh-lse-reset:hover:not(:disabled) { color: var(--dsw-alias-label-primary); }
.dsh-lse-reset:disabled { cursor: default; }
.dsh-lse-hint { margin: 0; font-size: 12px; line-height: 1.7; color: var(--dsw-alias-label-tertiary); }
.dsh-lse-invalid { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-state-error-primary); overflow-wrap: anywhere; }
.dsh-lse-switch-row { display: flex; align-items: center; }
.dsh-lse-textarea { width: 100%; box-sizing: border-box; resize: vertical; padding: 10px 12px; border-radius: var(--dsw-radius-md); border: 0.5px solid var(--dsw-alias-border-l4); background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; line-height: 1.55; }
.dsh-lse-textarea:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary); }
.dsh-lse-textarea:disabled { color: var(--dsw-alias-label-tertiary); cursor: default; }
.dsh-lse-textarea[aria-invalid='true'] { border-color: var(--dsw-alias-state-error-primary); }
.dsh-lse-number { width: 160px; }
.dsh-lse-stages { display: flex; flex-direction: column; gap: 8px; }
.dsh-lse-stage { display: flex; align-items: center; gap: 8px; }
.dsh-lse-stage-index { width: 14px; flex: none; font-size: 12px; color: var(--dsw-alias-label-tertiary); text-align: right; }
.dsh-lse-stage-input { flex: 1; min-width: 0; }
.dsh-lse-actions { display: flex; align-items: center; gap: 8px; }
.dsh-lse-names { display: flex; flex-direction: column; gap: 8px; }
.dsh-lse-tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dsh-lse-tag { display: inline-flex; align-items: center; gap: 2px; }
.dsh-lse-name-add { display: flex; align-items: center; gap: 8px; }
.dsh-lse-name-input { width: 220px; }
.dsh-lse-status { display: flex; flex-direction: column; gap: 4px; padding: 12px 0 0; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-lse-status-line { margin: 0; font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-primary); }
.dsh-lse-status[data-phase='failed'] .dsh-lse-status-line { color: var(--dsw-alias-state-error-primary); }
.dsh-lse-section { display: flex; flex-direction: column; min-width: 0; padding: 16px 0 0; border-top: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-lse-section-title { margin: 0; font-size: 13px; font-weight: 600; line-height: 1.5; color: var(--dsw-alias-label-primary); }
`

/** 注入卡片样式一次; 重复调用是空操作. */
export function installStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return
  const style = document.createElement('style')
  style.dataset['pluginCss'] = STYLE_ID
  style.textContent = CSS_TEXT
  document.head.appendChild(style)
}

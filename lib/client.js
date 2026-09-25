window.__ModuleLoader__.load({ id: "dsh-load-shell-env", factory: (require) => { var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
let react = require("react");
let react_jsx_runtime = require("react/jsx-runtime");
let _deepseek_ai_dsh_client_store = require("@deepseek-ai/dsh-client-store");
//#region src/constants.ts
/**
* 插件的公开标识符, 默认值与阈值.
*
* 这一份是 Host 与 Client 共同读取的常量来源: 两边都从包名, row id 与路由路径
* 派生同一套字符串, 免得界面或日志里出现第二个写法.
* @module dsh-load-shell-env/constants
*/
/** 包名: Client loader 的注册 id 与 `plugins.bundle.config` 槽位的键都用它. */
const PACKAGE_NAME = "dsh-load-shell-env";
/** 插件模块名 (导出的 `name`), 也是 Loader row id 去掉 `dsh-` 前缀后的写法. */
const PLUGIN_NAME = "load-shell-env";
/** Loader row id: 配置表单寻址与 `configForms.whileServed` 都用它. */
const ENTRY_ID = PLUGIN_NAME;
/** locale 字典命名空间. */
const LOCALE_NS = PLUGIN_NAME;
/** 状态查询路由 (exact). */
const STATUS_PATH = "/api/plugins/dsh-load-shell-env/status";
/** 手动刷新路由 (exact). */
const REFRESH_PATH = "/api/plugins/dsh-load-shell-env/refresh";
/** 刷新请求必须带的自定义头, 只是防误触, 不是安全边界. */
const REFRESH_HEADER = "x-dsh-load-shell-env";
/** 导入名单的默认值: 只把 PATH 带进子进程. */
const DEFAULT_IMPORT_NAMES = ["PATH"];
/** 合法的环境变量名. */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** 配置字段名 (Host schema, profile patch 与配置页共用). */
const FIELD = {
	enabled: "enabled",
	stages: "stages",
	importNames: "importNames",
	customEnv: "customEnv",
	envTimeoutMs: "envTimeoutMs",
	filterNoise: "filterNoise",
	timeoutMs: "timeoutMs",
	maxOutputBytes: "maxOutputBytes"
};
//#endregion
//#region src/client/fields.tsx
/**
* 卡片里的自绘控件.
*
* 官方字段控件只覆盖单行文本, 数字与密文三类, 布尔, 多行文本与列表需要自己画;
* 这里复刻官方字段行的节奏 (标签 13px/500, 说明 12px tertiary, 每行 12px 内边距,
* 行间 0.5px hairline), 并把 `已覆盖` 与 `恢复默认` 放在右侧.
* @module dsh-load-shell-env/client/fields
*/
/** 一行字段的外壳. */
function FieldRow(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-lse-field",
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-lse-head",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
					className: "dsh-lse-label",
					htmlFor: props.id,
					children: props.label
				}), props.trailing === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-lse-badges",
					children: props.trailing
				})]
			}),
			props.children,
			props.hint === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-lse-hint",
				children: props.hint
			})
		]
	});
}
/** `已覆盖` 标记与 `恢复默认` 按钮. */
function OverrideTrailing(props) {
	if (!props.overridden) return null;
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
		className: "dsh-lse-overridden",
		children: props.overriddenLabel
	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		className: "dsh-lse-reset",
		disabled: props.disabled,
		onClick: props.onReset,
		children: props.resetLabel
	})] });
}
/** 布尔字段: 自绘行 + 官方 Switch. */
function SwitchField(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldRow, {
		id: props.id,
		label: props.label,
		hint: props.hint,
		trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverrideTrailing, {
			overridden: props.overridden,
			overriddenLabel: props.overriddenLabel,
			resetLabel: props.resetLabel,
			disabled: props.disabled,
			onReset: props.onReset
		}),
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
			className: "dsh-lse-switch-row",
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
				checked: props.checked,
				onChange: props.onToggle,
				label: props.label,
				disabled: props.disabled
			})
		})
	});
}
/** 多行文本字段. */
function TextAreaField(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(FieldRow, {
		id: props.id,
		label: props.label,
		hint: props.hint,
		trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverrideTrailing, {
			overridden: props.overridden,
			overriddenLabel: props.overriddenLabel,
			resetLabel: props.resetLabel,
			disabled: props.disabled,
			onReset: props.onReset
		}),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
			id: props.id,
			className: "dsh-lse-textarea",
			rows: props.rows ?? 6,
			value: props.text,
			placeholder: props.placeholder,
			"aria-invalid": props.invalid,
			disabled: props.disabled,
			onChange: (event) => {
				props.onEdit(event.target.value);
			}
		}), props.invalid && props.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "dsh-lse-invalid",
			children: props.error
		}) : null]
	});
}
/** 数字字段: 自己画 input, 免得把文本草稿先变成数字. */
function NumberField(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(FieldRow, {
		id: props.id,
		label: props.label,
		hint: props.hint,
		trailing: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverrideTrailing, {
			overridden: props.overridden,
			overriddenLabel: props.overriddenLabel,
			resetLabel: props.resetLabel,
			disabled: props.disabled,
			onReset: props.onReset
		}),
		children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
			id: props.id,
			className: "dsh-lse-number",
			inputMode: "numeric",
			value: props.text,
			"aria-invalid": props.invalid,
			disabled: props.disabled,
			onChange: (event) => {
				props.onEdit(event.target.value);
			}
		}), props.invalid ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
			className: "dsh-lse-invalid",
			children: props.invalidLabel
		}) : null]
	});
}
/** 流水线: 每行一个命令输入 + 启用开关 + 删除按钮, 底部是"添加一级". */
function StageList(props) {
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldRow, {
		id: props.id,
		label: props.label,
		hint: props.hint,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-lse-stages",
			children: [
				props.stages.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-lse-hint",
					children: props.emptyLabel
				}) : null,
				props.stages.map((stage, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-lse-stage",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-lse-stage-index",
							children: index + 1
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
							className: "dsh-lse-stage-input",
							value: stage.command,
							placeholder: props.placeholder,
							"aria-label": `${props.label} ${String(index + 1)}`,
							disabled: props.disabled,
							onChange: (event) => {
								props.onEdit(index, event.target.value);
							}
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Switch, {
							checked: stage.enabled,
							onChange: (next) => {
								props.onToggle(index, next);
							},
							label: props.toggleLabel,
							disabled: props.disabled
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
							variant: "ghost",
							size: "sm",
							disabled: props.disabled,
							"aria-label": props.removeLabel,
							onClick: () => {
								props.onRemove(index);
							},
							children: "×"
						})
					]
				}, stage.key)),
				props.invalid ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-lse-invalid",
					children: props.invalidLabel
				}) : null,
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "dsh-lse-actions",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						size: "sm",
						disabled: props.disabled,
						onClick: props.onAdd,
						children: props.addLabel
					})
				})
			]
		})
	});
}
/** 导入名单: 一行 Tag, 一条新名字的输入框与添加按钮. */
function NameList(props) {
	const [draft, setDraft] = (0, react.useState)("");
	const [rejected, setRejected] = (0, react.useState)(false);
	const submit = () => {
		if (draft.trim() === "") return;
		if (props.onAdd(draft)) {
			setDraft("");
			setRejected(false);
			return;
		}
		setRejected(true);
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldRow, {
		id: props.id,
		label: props.label,
		hint: props.hint,
		children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
			className: "dsh-lse-names",
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-lse-tags",
					children: [props.names.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-lse-hint",
						children: props.emptyLabel
					}) : null, props.names.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-lse-tag",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
							tone: "neutral",
							children: name
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "dsh-lse-reset",
							"aria-label": props.removeLabel(name),
							disabled: props.disabled,
							onClick: () => {
								props.onRemove(name);
							},
							children: "×"
						})]
					}, name))]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-lse-name-add",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Input, {
						className: "dsh-lse-name-input",
						value: draft,
						placeholder: props.placeholder,
						"aria-label": props.label,
						"aria-invalid": rejected,
						disabled: props.disabled,
						onChange: (event) => {
							setDraft(event.target.value);
							setRejected(false);
						},
						onKeyDown: (event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								submit();
							}
						}
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						size: "sm",
						disabled: props.disabled,
						onClick: submit,
						children: props.addLabel
					})]
				}),
				rejected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "dsh-lse-invalid",
					children: props.invalidLabel
				}) : null
			]
		})
	});
}
//#endregion
//#region src/client/card.tsx
/**
* Plugins 页上 dsh-load-shell-env 卡片的配置页.
*
* 骨架用官方 `SettingsForm` (草稿, 保存与其它插件一致), 控件全部自绘; 状态区显示
* Host 侧最近一次读取的时间, 耗时, 注入的变量名与失败摘要, 右侧是手动刷新.
* @module dsh-load-shell-env/client/card
*/
/**
* 渲染卡片的简介或配置表单 (bundle 配置槽只会要 `page`, 简介分支是为了稳妥).
* @param props - 视图, 表单快照与动作, 文案.
* @returns 简介文本或配置表单.
*/
function ShellEnvSettingsCard(props) {
	const { t } = props;
	const state = props.useShellEnvCard((snapshot) => snapshot);
	const refreshStatus = props.refreshStatus;
	(0, react.useEffect)(() => {
		refreshStatus();
	}, []);
	if (props.view === "summary") return t("description");
	const labels = {
		unavailable: t("formUnavailable"),
		readOnly: t("formReadOnly"),
		saveFailed: t("formSaveFailed"),
		save: t("save"),
		saving: t("saving")
	};
	const locked = !state.writable;
	const pipelineLocked = locked || !state.enabled;
	const overridden = {
		overriddenLabel: t("overridden"),
		resetLabel: t("reset")
	};
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.SettingsForm, {
		labels,
		state,
		onSave: props.save,
		onDiscard: props.discard,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchField, {
				id: "plugin-config-load-shell-env-enabled",
				label: t("enabled"),
				hint: t("enabledHint"),
				checked: state.enabled,
				overridden: state.overridden.enabled,
				disabled: locked,
				onToggle: props.setEnabled,
				onReset: () => {
					props.resetField("enabled");
				},
				...overridden
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StageList, {
				id: "plugin-config-load-shell-env-stages",
				label: t("stages"),
				hint: t("stagesHint"),
				emptyLabel: t("stageEmpty"),
				placeholder: t("stagePlaceholder"),
				invalidLabel: t("stagesInvalid"),
				toggleLabel: t("stageToggle"),
				addLabel: t("stageAdd"),
				removeLabel: t("stageRemove"),
				stages: state.stages,
				invalid: state.stagesInvalid,
				disabled: pipelineLocked,
				onAdd: props.addStage,
				onEdit: props.updateStage,
				onToggle: props.toggleStage,
				onRemove: props.removeStage
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchField, {
				id: "plugin-config-load-shell-env-filter-noise",
				label: t("filterNoise"),
				hint: t("filterNoiseHint"),
				checked: state.filterNoise,
				overridden: state.overridden.filterNoise,
				disabled: pipelineLocked,
				onToggle: props.setFilterNoise,
				onReset: () => {
					props.resetField("filterNoise");
				},
				...overridden
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NameList, {
				id: "plugin-config-load-shell-env-names",
				label: t("importNames"),
				hint: t("importNamesHint"),
				emptyLabel: t("statusEmpty"),
				placeholder: t("importNamePlaceholder"),
				addLabel: t("importNameAdd"),
				invalidLabel: t("importNameInvalid"),
				removeLabel: (name) => t("importNameRemove", { name }),
				names: state.importNames,
				disabled: pipelineLocked,
				onAdd: props.addImportName,
				onRemove: props.removeImportName
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
				id: "plugin-config-load-shell-env-timeout",
				label: t("envTimeout"),
				hint: t("envTimeoutHint"),
				text: state.envTimeoutMsText,
				invalid: state.envTimeoutInvalid,
				invalidLabel: t("envTimeoutInvalid"),
				overridden: state.overridden.envTimeoutMs,
				disabled: pipelineLocked,
				onEdit: props.editTimeoutText,
				onReset: () => {
					props.resetField("envTimeoutMsText");
				},
				...overridden
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(TextAreaField, {
				id: "plugin-config-load-shell-env-custom",
				label: t("customEnv"),
				hint: t("customEnvHint"),
				placeholder: t("customEnvPlaceholder"),
				rows: 5,
				text: state.customEnv,
				invalid: state.customEnvError !== void 0,
				error: state.customEnvError === void 0 ? void 0 : t("customEnvInvalid", { message: state.customEnvError }),
				overridden: state.overridden.customEnv,
				disabled: locked,
				onEdit: props.editCustomEnv,
				onReset: () => {
					props.resetField("customEnv");
				},
				...overridden
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusBlock, {
				t,
				state,
				onRefresh: props.refresh
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-lse-section",
				"aria-labelledby": "plugin-config-load-shell-env-terminal",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: "dsh-lse-section-title",
						id: "plugin-config-load-shell-env-terminal",
						children: t("terminalSection")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
						id: "plugin-config-load-shell-env-command-timeout",
						label: t("commandTimeout"),
						hint: t("commandTimeoutHint"),
						text: state.timeoutMsText,
						invalid: state.timeoutMsInvalid,
						invalidLabel: t("numberInvalid"),
						overridden: state.overridden.timeoutMs,
						disabled: locked,
						onEdit: props.editCommandTimeoutText,
						onReset: () => {
							props.resetField("timeoutMsText");
						},
						...overridden
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
						id: "plugin-config-load-shell-env-max-output",
						label: t("maxOutputBytes"),
						hint: t("maxOutputBytesHint"),
						text: state.maxOutputBytesText,
						invalid: state.maxOutputBytesInvalid,
						invalidLabel: t("numberInvalid"),
						overridden: state.overridden.maxOutputBytes,
						disabled: locked,
						onEdit: props.editMaxOutputBytesText,
						onReset: () => {
							props.resetField("maxOutputBytesText");
						},
						...overridden
					})
				]
			})
		]
	});
}
/** 状态区: 阶段, 时间, 耗时, 变量名与失败摘要, 加一个手动刷新. */
function StatusBlock(props) {
	const { t, state } = props;
	const status = state.status;
	const phase = {
		disabled: t("statusDisabled"),
		idle: t("statusIdle"),
		reading: t("statusReading"),
		ready: t("statusReady"),
		failed: t("statusFailed")
	}[status.phase];
	return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
		className: "dsh-lse-status",
		"data-phase": status.phase,
		id: `plugin-config-${ENTRY_ID}-status`,
		children: [
			/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-lse-head",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-lse-label",
					children: t("statusTitle")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "dsh-lse-badges",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Button, {
						variant: "outline",
						size: "sm",
						disabled: state.refreshing || !state.enabled || !state.writable,
						onClick: props.onRefresh,
						children: state.refreshing ? t("refreshing") : t("refresh")
					})
				})]
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-lse-status-line",
				role: "status",
				children: phase
			}),
			status.lastReadAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-lse-hint",
				children: t("statusLastRead", { time: formatTime(status.lastReadAt) })
			}),
			status.durationMs === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-lse-hint",
				children: t("statusDuration", { duration: String(status.durationMs) })
			}),
			/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-lse-hint",
				children: status.importedCount === 0 ? t("statusEmpty") : t("statusImported", {
					count: String(status.importedCount),
					names: status.importedNames.join(", ")
				})
			}),
			status.skippedSegments === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-lse-hint",
				children: t("statusSkipped", { count: String(status.skippedSegments) })
			}),
			status.error === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-lse-invalid",
				children: status.error.stage === void 0 ? status.error.message : t("statusError", {
					stage: String(status.error.stage),
					message: status.error.message
				})
			}),
			state.refreshError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
				className: "dsh-lse-invalid",
				children: t("refreshFailed", { message: state.refreshError })
			})
		]
	});
}
/** 把 ISO 时间转成本地可读文本. */
function formatTime(iso) {
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}
//#endregion
//#region src/client/locales.ts
/** 中文文案. */
const zh = {
	title: "Shell 环境同步",
	description: "把你自己的 shell 环境 (PATH 等) 带进 agent 的命令.",
	enabled: "启用",
	enabledHint: "打开并保存后, 插件才会执行下面的流水线去读你的 shell 环境; 关闭时命令立刻回到继承环境.",
	stages: "读取流水线",
	stagesHint: "按顺序累积执行: 第 N 级用第 N-1 级的输出当自己的环境. 每一级必须自己输出 NUL 分隔的 KEY=VALUE, 例如 fish -l -i -c \"env -0\".",
	stagePlaceholder: "一条完整的 sh 命令行, 例如 fish -l -i -c \"env -0\"",
	stageToggle: "启用这一级",
	stageAdd: "添加一级",
	stageRemove: "删除这一级",
	stageEmpty: "还没有任何一级; 这时只有自定义 env 生效.",
	stagesInvalid: "启用的级不能是空命令; 不想要它就关掉这一级.",
	importNames: "导入名单",
	importNamesHint: "只把这些变量名从快照注入子进程. 默认只有 PATH; 不要放 DSH_ 前缀, 那是 harness 自己的命名空间.",
	importNamePlaceholder: "变量名, 例如 PATH",
	importNameAdd: "添加",
	importNameRemove: "移除 {name}",
	importNameInvalid: "变量名不合法, 或落在 DSH_ 命名空间里.",
	customEnv: "自定义 env",
	customEnvHint: "每行一条 KEY=VALUE, 支持 $VAR / ${VAR} 展开与 \\$ 转义; KEY= 表示从命令环境里删除该变量. 这一层排在流水线之后.",
	customEnvPlaceholder: "PATH=$PATH:$HOME/.local/bin",
	customEnvInvalid: "自定义 env 不合法: {message}",
	envTimeout: "每级超时 (毫秒)",
	envTimeoutHint: "每一级各自计时; 超时即整次读取失败, 并保留上一次成功的快照.",
	envTimeoutInvalid: "请填一个正整数毫秒值.",
	filterNoise: "输出容错",
	filterNoiseHint: "遇到不符合 KEY=VALUE 约定的输出段时, 丢弃它并继续 (状态行会报告丢了几段), 而不是让这一级失败. 它只能救回\"噪声黏在变量名前面\"这种形态; 噪声如果糊进了值里, 任何解析器都看不出来, 只能从源头把消息改成写 stderr.",
	terminalSection: "终端",
	commandTimeout: "命令超时 (毫秒)",
	commandTimeoutHint: "单条命令允许运行多久, 超时即终止.",
	maxOutputBytes: "单流输出上限 (字节)",
	maxOutputBytesHint: "超出部分会转存到临时文件, 而不是被丢弃.",
	numberInvalid: "请填一个正整数.",
	statusTitle: "状态",
	statusDisabled: "未启用",
	statusIdle: "尚未读取",
	statusReading: "正在读取...",
	statusReady: "上次读取成功",
	statusFailed: "上次读取失败",
	statusLastRead: "读取时间: {time}",
	statusDuration: "耗时: {duration} ms",
	statusImported: "已导入 {count} 个变量: {names}",
	statusEmpty: "没有导入任何变量.",
	statusSkipped: "读取时丢弃了 {count} 段不符合约定的输出 (输出容错已打开).",
	statusError: "第 {stage} 级失败: {message}",
	refresh: "刷新",
	refreshing: "读取中...",
	refreshFailed: "状态请求没有成功: {message}",
	overridden: "已覆盖",
	reset: "恢复默认",
	formUnavailable: "该插件当前未加载, 暂时无法配置.",
	formReadOnly: "本部署的设置为只读.",
	formSaveFailed: "本部署没有接受这些值, 已保留供你修改.",
	save: "保存",
	saving: "保存中..."
};
/** 英文文案. */
const en = {
	title: "Shell environment sync",
	description: "Bring your own shell environment (PATH and friends) into agent commands.",
	enabled: "Enable",
	enabledHint: "Only after you turn this on and save does the plugin run the pipeline below against your shell environment; turning it off returns commands to the inherited environment immediately.",
	stages: "Read pipeline",
	stagesHint: "Stages accumulate in order: stage N runs with stage N-1 output as its environment. Each stage must print NUL-separated KEY=VALUE itself, for example fish -l -i -c \"env -0\".",
	stagePlaceholder: "A complete sh command line, e.g. fish -l -i -c \"env -0\"",
	stageToggle: "Enable this stage",
	stageAdd: "Add a stage",
	stageRemove: "Remove this stage",
	stageEmpty: "No stages yet; only the custom env below applies.",
	stagesInvalid: "An enabled stage must not be empty; disable it instead.",
	importNames: "Import names",
	importNamesHint: "Only these names are injected into child processes from the snapshot. The default is PATH alone; never use the DSH_ prefix, that namespace belongs to the harness.",
	importNamePlaceholder: "Variable name, e.g. PATH",
	importNameAdd: "Add",
	importNameRemove: "Remove {name}",
	importNameInvalid: "Not a valid variable name, or it belongs to the DSH_ namespace.",
	customEnv: "Custom env",
	customEnvHint: "One KEY=VALUE per line, with $VAR / ${VAR} expansion and \\$ escapes; KEY= removes that variable from the command environment. This layer applies after the pipeline.",
	customEnvPlaceholder: "PATH=$PATH:$HOME/.local/bin",
	customEnvInvalid: "Custom env is not usable: {message}",
	envTimeout: "Per-stage timeout (ms)",
	envTimeoutHint: "Each stage is timed on its own; a timeout fails the whole read and keeps the last successful snapshot.",
	envTimeoutInvalid: "Enter a positive whole number of milliseconds.",
	filterNoise: "Tolerate output noise",
	filterNoiseHint: "Drop output segments that do not follow the KEY=VALUE convention and keep going (the status row reports how many were dropped) instead of failing the stage. It only recovers the \"noise glued in front of a variable name\" shape; noise written into a value is invisible to any parser, so fix the message at its source instead (write it to stderr).",
	terminalSection: "Shell",
	commandTimeout: "Command timeout (ms)",
	commandTimeoutHint: "How long one command may run before it is terminated.",
	maxOutputBytes: "Output cap per stream (bytes)",
	maxOutputBytesHint: "Output beyond this spills to a temporary file rather than being lost.",
	numberInvalid: "Enter a positive whole number.",
	statusTitle: "Status",
	statusDisabled: "Disabled",
	statusIdle: "Not read yet",
	statusReading: "Reading...",
	statusReady: "Last read succeeded",
	statusFailed: "Last read failed",
	statusLastRead: "Read at {time}",
	statusDuration: "Took {duration} ms",
	statusImported: "Injected {count} variable(s): {names}",
	statusEmpty: "No variables injected.",
	statusSkipped: "Dropped {count} output segment(s) that did not follow the convention (output tolerance is on).",
	statusError: "Stage {stage} failed: {message}",
	refresh: "Refresh",
	refreshing: "Reading...",
	refreshFailed: "Status request failed: {message}",
	overridden: "Overridden",
	reset: "Reset",
	formUnavailable: "This plugin is not loaded right now, so it cannot be configured.",
	formReadOnly: "This deployment stores settings read-only.",
	formSaveFailed: "This deployment did not accept these values; they are kept for you to fix.",
	save: "Save",
	saving: "Saving..."
};
//#endregion
//#region src/custom-env.ts
/**
* 自定义 env: `.env` 风格的逐行文本, 支持 `$VAR` / `${VAR}` 展开与删除语义.
*
* 这一层排在流水线之后, 是 user 手写覆盖的地方; 展开时看到的取值来源是
* "继承环境 + 白名单快照" 再叠上**本文件里前面几条**的结果 (自上而下累积),
* 所以 `PATH=$PATH:$HOME/.local/bin` 这类写法按直觉工作.
* @module dsh-load-shell-env/custom-env
*/
/** 自定义 env 文本不合法. */
var CustomEnvError = class extends Error {
	line;
	/**
	* @param message - 一句话说明.
	* @param line - 出问题的行号, 从 1 开始.
	*/
	constructor(message, line) {
		super(message);
		this.line = line;
		this.name = "CustomEnvError";
	}
};
/**
* 解析 `.env` 风格文本.
*
* - `KEY=VALUE` 定义一条, 行首 `#` 与空行忽略, 行尾 `\r` 去掉;
* - 值两侧成对的单引号或双引号会被去掉 (与 `.env` 习惯一致);
* - 没有 `=` 或变量名不合法视为配置错误.
* @param text - 多行文本.
* @returns 按出现顺序排列的赋值.
* @throws CustomEnvError 某一行不合约定的写法.
*/
function parseCustomEnv(text) {
	const assignments = [];
	const lines = text.split("\n");
	for (const [offset, raw] of lines.entries()) {
		const line = offset + 1;
		const content = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
		const trimmed = content.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const separator = content.indexOf("=");
		if (separator < 0) throw new CustomEnvError(`line ${String(line)}: expected KEY=VALUE`, line);
		const name = content.slice(0, separator).trim();
		if (!ENV_NAME_PATTERN.test(name)) throw new CustomEnvError(`line ${String(line)}: "${name}" is not a valid environment variable name`, line);
		assignments.push({
			name,
			value: stripQuotes(content.slice(separator + 1)),
			line
		});
	}
	return assignments;
}
/** 去掉值两侧成对的引号. */
function stripQuotes(value) {
	const trimmed = value.trim();
	if (trimmed.length >= 2) {
		const first = trimmed[0];
		const last = trimmed[trimmed.length - 1];
		if (first === "\"" && last === "\"" || first === "'" && last === "'") return trimmed.slice(1, -1);
	}
	return trimmed;
}
//#endregion
//#region src/shared/status.ts
/** 一个尚未读过任何东西的初始状态. */
function initialStatus(enabled) {
	return {
		phase: enabled ? "idle" : "disabled",
		enabled,
		importedCount: 0,
		importedNames: []
	};
}
//#endregion
//#region src/client/settings-form.ts
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
/** 状态轮询的间隔: 只在 Host 说"正在读"的时候用. */
const STATUS_POLL_MS = 700;
/**
* 把配置表单桥接成卡片需要的快照与动作.
*/
var ShellEnvSettingsForm = class {
	scope;
	store;
	unsubscribe;
	sets = {};
	unsets = /* @__PURE__ */ new Set();
	baseline;
	saving = false;
	failed = false;
	disposed = false;
	status = initialStatus(false);
	refreshing = false;
	refreshError;
	pollTimer;
	/**
	* @param scope - `ctx.configForms.get(ENTRY_ID)` 拿到的共享配置表单.
	*/
	constructor(scope) {
		this.scope = scope;
		this.store = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)(this.projection());
		this.unsubscribe = scope.subscribe(() => {
			this.publish();
		});
	}
	/** 释放订阅与定时器. */
	dispose() {
		this.disposed = true;
		this.unsubscribe();
		if (this.pollTimer !== void 0) clearTimeout(this.pollTimer);
	}
	/** 组装 slot 注册要注入的面. */
	inject() {
		return {
			hooks: { shellEnvCard: this.store },
			setEnabled: (next) => {
				this.setField("enabled", next);
			},
			addStage: () => {
				this.setField("stages", [...this.stages(), {
					command: "",
					enabled: true
				}]);
			},
			updateStage: (index, command) => {
				this.setField("stages", this.stages().map((stage, at) => at === index ? {
					...stage,
					command
				} : stage));
			},
			toggleStage: (index, enabled) => {
				this.setField("stages", this.stages().map((stage, at) => at === index ? {
					...stage,
					enabled
				} : stage));
			},
			removeStage: (index) => {
				this.setField("stages", this.stages().filter((_, at) => at !== index));
			},
			addImportName: (name) => {
				const trimmed = name.trim();
				if (!importableName(trimmed)) return false;
				const names = this.importNames();
				this.setField("importNames", names.includes(trimmed) ? names : [...names, trimmed]);
				return true;
			},
			removeImportName: (name) => {
				this.setField("importNames", this.importNames().filter((entry) => entry !== name));
			},
			editCustomEnv: (text) => {
				this.setField("customEnv", text);
			},
			editTimeoutText: (text) => {
				this.setField("envTimeoutMsText", text);
			},
			setFilterNoise: (next) => {
				this.setField("filterNoise", next);
			},
			editCommandTimeoutText: (text) => {
				this.setField("timeoutMsText", text);
			},
			editMaxOutputBytesText: (text) => {
				this.setField("maxOutputBytesText", text);
			},
			edit: (field, text) => {
				if (field === FIELD.customEnv) this.setField("customEnv", text);
				else if (field === FIELD.envTimeoutMs) this.setField("envTimeoutMsText", text);
				else if (field === FIELD.timeoutMs) this.setField("timeoutMsText", text);
				else if (field === FIELD.maxOutputBytes) this.setField("maxOutputBytesText", text);
			},
			resetField: (field) => {
				if (isFieldName(field)) this.unsetField(field);
			},
			refreshStatus: () => {
				this.readStatus();
			},
			refresh: () => {
				this.triggerRefresh();
			},
			save: () => {
				this.save();
			},
			discard: () => {
				this.discard();
			}
		};
	}
	/** 丢掉全部草稿. */
	discard() {
		if (Object.keys(this.sets).length === 0 && this.unsets.size === 0 && !this.failed) return;
		this.sets = {};
		this.unsets.clear();
		this.baseline = void 0;
		this.failed = false;
		this.publish();
	}
	/**
	* 把草稿写成一次原子写入.
	*
	* 只写真正改过的字段; 被拒绝时保留草稿, 让 user 接着改而不是重打一遍.
	*/
	async save() {
		const snapshot = this.scope.getSnapshot();
		const state = this.store.getSnapshot();
		if (this.saving || !snapshot.writable || !state.dirty || state.invalid) return;
		const ops = this.pendingOps();
		if (ops.length === 0) return;
		this.saving = true;
		this.failed = false;
		this.publish();
		try {
			const landed = await this.scope.mutate(ops, this.baseline ?? snapshot.revision);
			if (landed) {
				this.sets = {};
				this.unsets.clear();
				this.baseline = void 0;
			}
			this.failed = !landed;
		} catch {
			this.failed = true;
		} finally {
			this.saving = false;
			this.publish();
			if (!this.failed) this.readStatus();
		}
	}
	/** 读一次 Host 侧状态. */
	readStatus() {
		this.request(STATUS_PATH, { method: "GET" });
	}
	/** 手动刷新: 走插件自己的刷新路由, 单飞, 不排队. */
	triggerRefresh() {
		if (this.refreshing) return;
		this.refreshing = true;
		this.refreshError = void 0;
		this.publish();
		this.request(REFRESH_PATH, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[REFRESH_HEADER]: "1"
			},
			body: "{}"
		});
	}
	/** 发起一次状态请求并把结果推进 store. */
	async request(path, init) {
		try {
			const response = await fetch(path, init);
			if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
			this.status = await response.json();
			this.refreshError = void 0;
		} catch (error) {
			this.refreshError = error instanceof Error ? error.message : String(error);
		} finally {
			this.refreshing = false;
			this.publish();
			this.schedulePoll();
		}
	}
	/** Host 还在读的时候轮询, 免得 user 盯着"正在读取"自己点刷新. */
	schedulePoll() {
		if (this.disposed || this.status.phase !== "reading" || this.pollTimer !== void 0) return;
		this.pollTimer = setTimeout(() => {
			this.pollTimer = void 0;
			this.readStatus();
		}, STATUS_POLL_MS);
	}
	/** 显式写入一个字段的草稿. */
	setField(field, value) {
		this.unsets.delete(field);
		this.sets = {
			...this.sets,
			[field]: value
		};
		this.touch();
	}
	/** 让一个字段回到组合层 (保存时 unset). */
	unsetField(field) {
		const next = { ...this.sets };
		delete next[field];
		this.sets = next;
		if (this.userLayerHas(field)) this.unsets.add(field);
		else this.unsets.delete(field);
		this.touch();
	}
	/** 记录一次草稿改动. */
	touch() {
		this.baseline ??= this.scope.getSnapshot().revision;
		this.failed = false;
		this.publish();
	}
	/** 当前要显示的值: 草稿 > 恢复默认时回落到组合层 > 生效值. */
	field(name) {
		const staged = this.sets[name];
		if (staged !== void 0) return staged;
		if (this.unsets.has(name)) return this.baseValue(name);
		return this.effectiveValue(name);
	}
	/** 当前生效值 (schema 默认已由 Host 解析进去). */
	effectiveValue(name) {
		const value = this.scope.getSnapshot().value;
		switch (name) {
			case "enabled": return value?.enabled ?? false;
			case "stages": return value?.stages ?? [];
			case "importNames": return value?.importNames ?? [...DEFAULT_IMPORT_NAMES];
			case "customEnv": return value?.customEnv ?? "";
			case "envTimeoutMsText": return String(value?.envTimeoutMs ?? 1e4);
			case "filterNoise": return value?.filterNoise ?? false;
			case "timeoutMsText": return String(value?.timeoutMs ?? 12e4);
			case "maxOutputBytesText": return String(value?.maxOutputBytes ?? 64e3);
		}
		/* v8 ignore next -- 上面的 case 覆盖了 FieldName 的全部取值 */
		throw new Error(`unknown field ${String(name)}`);
	}
	/** 组合层 (清掉用户层之后回落到的那一层) 的值. */
	baseValue(name) {
		const base = this.scope.getSnapshot().base;
		switch (name) {
			case "enabled": return base?.enabled ?? false;
			case "stages": return base?.stages ?? [];
			case "importNames": return base?.importNames ?? [...DEFAULT_IMPORT_NAMES];
			case "customEnv": return base?.customEnv ?? "";
			case "envTimeoutMsText": return String(base?.envTimeoutMs ?? 1e4);
			case "filterNoise": return base?.filterNoise ?? false;
			case "timeoutMsText": return String(base?.timeoutMs ?? 12e4);
			case "maxOutputBytesText": return String(base?.maxOutputBytes ?? 64e3);
		}
		/* v8 ignore next -- 上面的 case 覆盖了 FieldName 的全部取值 */
		throw new Error(`unknown field ${String(name)}`);
	}
	/** 用户层里是否有这个字段 (决定 `已覆盖` 与 unset 是否必要). */
	userLayerHas(name) {
		const user = this.scope.getSnapshot().user;
		if (user === null || typeof user !== "object") return false;
		const key = configPathOf(name);
		return Object.hasOwn(user, key);
	}
	/** 流水线草稿. */
	stages() {
		return this.field("stages");
	}
	/** 导入名单草稿. */
	importNames() {
		return this.field("importNames");
	}
	/** 组装卡片读到的整块状态. */
	projection() {
		const snapshot = this.scope.getSnapshot();
		const stages = this.stages();
		const importNames = this.importNames();
		const customEnv = this.field("customEnv");
		const timeoutText = this.field("envTimeoutMsText");
		const timeout = Number(timeoutText.trim());
		const envTimeoutInvalid = timeoutText.trim() === "" || !Number.isInteger(timeout) || timeout <= 0;
		const commandTimeoutText = this.field("timeoutMsText");
		const commandTimeoutInvalid = positiveInteger(commandTimeoutText) === void 0;
		const maxOutputText = this.field("maxOutputBytesText");
		const maxOutputInvalid = positiveInteger(maxOutputText) === void 0;
		const stagesInvalid = stages.some((stage) => stage.enabled !== false && stage.command.trim() === "");
		const customEnvError = customEnvProblem(customEnv);
		return {
			available: snapshot.status === "ready",
			writable: snapshot.writable,
			dirty: this.pendingOps().length > 0,
			invalid: envTimeoutInvalid || commandTimeoutInvalid || maxOutputInvalid || stagesInvalid || customEnvError !== void 0,
			saving: this.saving,
			failed: this.failed,
			enabled: this.field("enabled"),
			stages: stages.map((stage, index) => ({
				key: `stage-${String(index)}`,
				command: stage.command,
				enabled: stage.enabled !== false
			})),
			importNames: [...importNames],
			customEnv,
			envTimeoutMsText: timeoutText,
			filterNoise: this.field("filterNoise"),
			timeoutMsText: commandTimeoutText,
			maxOutputBytesText: maxOutputText,
			overridden: {
				enabled: this.userLayerHas("enabled"),
				stages: this.userLayerHas("stages"),
				importNames: this.userLayerHas("importNames"),
				customEnv: this.userLayerHas("customEnv"),
				envTimeoutMs: this.userLayerHas("envTimeoutMsText"),
				filterNoise: this.userLayerHas("filterNoise"),
				timeoutMs: this.userLayerHas("timeoutMsText"),
				maxOutputBytes: this.userLayerHas("maxOutputBytesText")
			},
			stagesInvalid,
			customEnvError,
			envTimeoutInvalid,
			timeoutMsInvalid: commandTimeoutInvalid,
			maxOutputBytesInvalid: maxOutputInvalid,
			status: this.status,
			refreshing: this.refreshing,
			refreshError: this.refreshError
		};
	}
	/** 当前草稿相对生效值需要写入的那些操作. */
	pendingOps() {
		const ops = [];
		for (const [name, value] of Object.entries(this.sets)) {
			const op = this.setOp(name, value);
			if (op !== void 0) ops.push(op);
		}
		for (const name of this.unsets) {
			if (!this.userLayerHas(name)) continue;
			ops.push({
				op: "unset",
				path: [configPathOf(name)]
			});
		}
		return ops;
	}
	/** 一个显式写入的字段落成什么操作; 没有实际变化时是 undefined. */
	setOp(name, value) {
		const path = configPathOf(name);
		if (name === "envTimeoutMsText" || name === "timeoutMsText" || name === "maxOutputBytesText") {
			const parsed = positiveInteger(String(value));
			if (parsed === void 0) return void 0;
			return parsed === Number(this.effectiveValue(name)) ? void 0 : {
				op: "set",
				path: [path],
				value: parsed
			};
		}
		if (name === "customEnv") {
			const text = String(value);
			if (text === this.effectiveValue("customEnv")) return void 0;
			return text === "" ? {
				op: "unset",
				path: [path]
			} : {
				op: "set",
				path: [path],
				value: text
			};
		}
		if (name === "stages") {
			const stages = value.map((stage) => ({
				command: stage.command,
				enabled: stage.enabled !== false
			}));
			if (JSON.stringify(stages) === JSON.stringify(this.effectiveValue("stages"))) return void 0;
			return {
				op: "set",
				path: [path],
				value: stages
			};
		}
		if (JSON.stringify(value) === JSON.stringify(this.effectiveValue(name))) return void 0;
		return {
			op: "set",
			path: [path],
			value
		};
	}
	/** 通知组件状态变了. */
	publish() {
		if (this.disposed) return;
		this.store.set(this.projection());
	}
};
/** 是否是本卡片认识的字段名. */
function isFieldName(field) {
	return field === "enabled" || field === "stages" || field === "importNames" || field === "customEnv" || field === "envTimeoutMsText" || field === "filterNoise" || field === "timeoutMsText" || field === "maxOutputBytesText";
}
/** 草稿字段名对应的 profile patch 路径. */
function configPathOf(name) {
	switch (name) {
		case "envTimeoutMsText": return FIELD.envTimeoutMs;
		case "timeoutMsText": return FIELD.timeoutMs;
		case "maxOutputBytesText": return FIELD.maxOutputBytes;
		default: return name;
	}
}
/** 文本草稿是否是正整数; 不是就返回 undefined. */
function positiveInteger(text) {
	const parsed = Number(text.trim());
	return Number.isInteger(parsed) && parsed > 0 ? parsed : void 0;
}
/** 自定义 env 的问题描述; 没问题时是 undefined. */
function customEnvProblem(text) {
	if (text.trim() === "") return void 0;
	try {
		for (const assignment of parseCustomEnv(text)) if (!importableName(assignment.name)) return `"${assignment.name}" is not a usable variable name`;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}
/** 是否是能进导入名单或自定义 env 的名字. */
function importableName(name) {
	return ENV_NAME_PATTERN.test(name) && !name.startsWith("DSH_");
}
//#endregion
//#region src/client/styles.ts
/**
* 卡片样式.
*
* 只用 `--dsw-alias-*` 语义 token, 行节奏对齐官方设置页 (标签 13px/500, 说明 12px
* tertiary, 每行 12px 内边距, 行间 0.5px hairline). 外部插件的 tsdown 构建里没有
* CSS Modules 预设, 所以这里用 `data-plugin-css` 标记注入一次, 与官方预设的去重
* 标记同一个键.
* @module dsh-load-shell-env/client/styles
*/
const STYLE_ID = "dsh-load-shell-env-card";
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
`;
/** 注入卡片样式一次; 重复调用是空操作. */
function installStyles() {
	if (typeof document === "undefined") return;
	if (document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) !== null) return;
	const style = document.createElement("style");
	style.dataset["pluginCss"] = STYLE_ID;
	style.textContent = CSS_TEXT;
	document.head.appendChild(style);
}
//#endregion
//#region src/client/index.ts
/** 页面依赖的服务: configForms 提供配置通道, slots 提供注册面, locale 提供文案. */
const inject = [
	"configForms",
	"slots",
	"locale"
];
/**
* 注册插件页的配置卡片.
*
* `whileServed` 与表单寻址用的是 Loader row id, 而 `plugins.bundle.config` 槽位的键
* 是包名; Host 没有组合这一行时 (Windows 上就是这种情况) 卡片不出现.
* @param ctx - 浏览器插件上下文.
*/
function apply(ctx) {
	installStyles();
	const t = ctx.locale.bind(LOCALE_NS);
	ctx.effect(() => ctx.locale.register(LOCALE_NS, {
		zh,
		en
	}), "dsh-load-shell-env: dictionaries");
	const form = new ShellEnvSettingsForm(ctx.configForms.get(ENTRY_ID));
	ctx.effect(() => () => {
		form.dispose();
	}, "dsh-load-shell-env: settings form");
	ctx.effect(() => ctx.configForms.whileServed([ENTRY_ID], () => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
		name: "plugins.bundle.config",
		key: PACKAGE_NAME,
		inject: () => ({
			...form.inject(),
			t
		})
	}, ShellEnvSettingsCard))), "dsh-load-shell-env: plugins page card");
}
//#endregion
exports.apply = apply;
exports.inject = inject;

return module.exports; } });
//# sourceMappingURL=client.js.map
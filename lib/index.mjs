import { SandboxBashExecutor } from "@deepseek-ai/dsh-bash-sandbox";
import { LocalBashExecutor } from "@deepseek-ai/dsh-bash-local";
import z from "@deepseek-ai/schemastery";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
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
/** 状态查询路由 (exact). */
const STATUS_PATH = "/api/plugins/dsh-load-shell-env/status";
/** 手动刷新路由 (exact). */
const REFRESH_PATH = "/api/plugins/dsh-load-shell-env/refresh";
/** 每一级 stage 的默认超时 (毫秒). */
const DEFAULT_ENV_TIMEOUT_MS = 1e4;
/** 导入名单的默认值: 只把 PATH 带进子进程. */
const DEFAULT_IMPORT_NAMES = ["PATH"];
/** 单个 stage 的 stdout 上限; 超过即按该级失败处理, 避免一份失控输出吃掉 Host 内存. */
const MAX_STAGE_OUTPUT_BYTES = 4194304;
/** 失败时保留的 stderr 尾部字节数. */
const MAX_STAGE_STDERR_BYTES = 8192;
/** 合法的环境变量名. */
const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
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
/** 展开过程中的错误; 由 {@link applyCustomEnv} 补上行号后重抛. */
var ExpansionError = class extends Error {};
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
/**
* 把赋值展开后叠加到给定的取值来源上.
*
* 空值 (包括 `KEY=` 与 `KEY=""`) 是 tombstone: 该变量从子进程环境里删除, 而不是
* 设成空串. 展开时未定义的变量按空串处理 (`\$` 表示字面量 `$`).
* @param assignments - {@link parseCustomEnv} 的结果.
* @param base - 本次展开的初始取值来源 (继承环境 + 白名单快照).
* @returns 需要在子进程环境里覆盖或删除的条目; 同名的后者覆盖前者.
* @throws CustomEnvError 展开语法不合法.
*/
function applyCustomEnv(assignments, base) {
	const scope = { ...base };
	const entries = {};
	for (const assignment of assignments) {
		let expanded;
		try {
			expanded = expandVariables(assignment.value, scope);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new CustomEnvError(`line ${String(assignment.line)}: ${message}`, assignment.line);
		}
		const value = expanded === "" ? void 0 : expanded;
		scope[assignment.name] = value;
		entries[assignment.name] = value;
	}
	return entries;
}
/**
* 展开一段值里的 `$VAR` / `${VAR}` / `\$`.
* @param value - 待展开的文本.
* @param scope - 变量名到值的映射; 缺席或 undefined 展开成空串.
* @returns 展开后的文本.
* @throws ExpansionError `${...}` 没有收尾或变量名不合法.
*/
function expandVariables(value, scope) {
	let result = "";
	for (let index = 0; index < value.length; index++) {
		const char = value[index];
		if (char === "\\" && value[index + 1] === "$") {
			result += "$";
			index++;
			continue;
		}
		if (char !== "$") {
			result += char;
			continue;
		}
		const next = value[index + 1];
		if (next === "{") {
			const end = value.indexOf("}", index + 2);
			if (end < 0) throw new ExpansionError("unterminated ${...} expansion");
			const name = value.slice(index + 2, end);
			if (!ENV_NAME_PATTERN.test(name)) throw new ExpansionError(`"${name}" is not a valid variable name`);
			result += scope[name] ?? "";
			index = end;
			continue;
		}
		if (next !== void 0 && /[A-Za-z_]/.test(next)) {
			let end = index + 1;
			while (end < value.length && /[A-Za-z0-9_]/.test(value[end])) end++;
			result += scope[value.slice(index + 1, end)] ?? "";
			index = end - 1;
			continue;
		}
		result += char;
	}
	return result;
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
//#region src/config.ts
const BASE_FIELDS = LocalBashExecutor.Config.dict ?? {};
/**
* 插件配置 schema.
*
* 注意 executor 的六个字段仍然在 schema 里 (否则 profile patch 写它们不生效),
* 但它们**不出现在配置页上**: 替换掉内置 `bash-sandbox` 行之后, 官方那张 shell
* 设置卡片会跟着退场, 需要调这些值的部署用 profile patch (README 有示例).
*/
const Config = z.object({
	...BASE_FIELDS,
	enabled: z.boolean().default(false).volatile(),
	stages: z.array(z.object({
		command: z.string(),
		enabled: z.boolean().default(true)
	})).default([]).volatile(),
	importNames: z.array(z.string()).default([...DEFAULT_IMPORT_NAMES]).volatile(),
	customEnv: z.string().default("").volatile(),
	envTimeoutMs: z.number().default(DEFAULT_ENV_TIMEOUT_MS).volatile(),
	filterNoise: z.boolean().default(false).volatile()
});
/** 配置校验失败; 消息里带字段名, 便于对着 profile patch 查. */
var ShellEnvConfigError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "ShellEnvConfigError";
	}
};
/**
* 校验一个变量名是否可以出现在导入名单或自定义 env 里.
* @param field - 出错的字段名, 用于组装消息.
* @param name - 待校验的变量名.
* @throws ShellEnvConfigError 名字不合法或落在 harness 自己的命名空间里.
*/
function assertImportableName(field, name) {
	if (!ENV_NAME_PATTERN.test(name)) throw new ShellEnvConfigError(`${field}: "${name}" is not a valid environment variable name`);
	if (name.startsWith("DSH_")) throw new ShellEnvConfigError(`${field}: "${name}" is reserved for the harness (DSH_* facts come from the dshEnv layer)`);
}
/**
* 只校验自定义 env 的变量名, 不关心值.
* @param field - 出错的字段名.
* @param text - `.env` 风格的多行文本.
* @throws ShellEnvConfigError 文本不可解析, 或变量名不合法.
*/
function assertCustomEnvNames(field, text) {
	for (const assignment of parseCustomEnv(text)) assertImportableName(field, assignment.name);
}
/**
* 校验整个配置; 不合法就在加载时报出可操作的错误, 不静默跳过.
*
* 未启用的 stage 允许留空命令 (那正是"留档但不参与"的用法), 启用的那一级必须非空.
* @param config - schema 解析后的活动配置.
* @throws ShellEnvConfigError 指出字段与不合法的值.
*/
function validateShellEnvConfig(config) {
	const timeout = config.envTimeoutMs.get();
	if (!Number.isInteger(timeout) || timeout <= 0) throw new ShellEnvConfigError(`envTimeoutMs: expected a positive integer number of milliseconds, got ${String(timeout)}`);
	for (const name of config.importNames.get()) assertImportableName("importNames", name);
	assertCustomEnvNames("customEnv", config.customEnv.get());
	config.stages.get().forEach((stage, index) => {
		if (stage.enabled === false) return;
		if (stage.command.trim() === "") throw new ShellEnvConfigError(`stages/${String(index)}/command: an enabled stage must not be empty (disable it instead)`);
	});
}
//#endregion
//#region src/read-config.ts
/**
* 从活动配置里取出一份归一化的读取配置.
* @param config - schema 解析后的活动配置.
* @returns 供 store 使用的读取配置.
*/
function readShellEnvConfig(config) {
	const stages = [];
	config.stages.get().forEach((stage, offset) => {
		if (stage.enabled === false) return;
		stages.push({
			index: offset + 1,
			command: stage.command
		});
	});
	return {
		enabled: config.enabled.get(),
		stages,
		importNames: [...config.importNames.get()],
		customEnv: config.customEnv.get(),
		envTimeoutMs: config.envTimeoutMs.get(),
		filterNoise: config.filterNoise.get()
	};
}
//#endregion
//#region src/routes.ts
/**
* 注册状态与刷新路由.
* @param ctx - 已经拿到 webServer 服务的宿主上下文.
* @param host - 状态与刷新入口.
*/
function mountShellEnvRoutes(ctx, host) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: STATUS_PATH,
		handler: (req, res) => {
			handleStatus(req, res, host);
		}
	}), "dsh-load-shell-env: status route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: REFRESH_PATH,
		handler: (req, res) => handleRefresh(req, res, host)
	}), "dsh-load-shell-env: refresh route");
}
/** GET 状态: 只返回阶段, 时间, 变量名与失败摘要, 不含任何变量值. */
function handleStatus(req, res, host) {
	if (req.method !== "GET") {
		sendEmpty(res, 405, "GET");
		return;
	}
	sendJson(res, 200, host.status());
}
/** POST 刷新: 先过几道防误触检查, 再触发一次读取并等它结束. */
async function handleRefresh(req, res, host) {
	if (req.method !== "POST") {
		sendEmpty(res, 405, "POST");
		return;
	}
	if (req.headers["x-dsh-load-shell-env"] !== "1") {
		sendEmpty(res, 400);
		return;
	}
	if (!(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
		sendEmpty(res, 400);
		return;
	}
	const fetchMode = req.headers["sec-fetch-mode"];
	if (fetchMode !== void 0 && fetchMode !== "same-origin" && fetchMode !== "cors") {
		sendEmpty(res, 403);
		return;
	}
	if (!await drain(req)) {
		sendEmpty(res, 400);
		return;
	}
	try {
		sendJson(res, 200, await host.refresh());
	} catch (error) {
		sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
	}
}
/** 读完请求体; 超过上限返回 false. */
async function drain(req) {
	let size = 0;
	try {
		for await (const chunk of req) {
			size += chunk.length;
			if (size > 4096) return false;
		}
	} catch {
		return false;
	}
	return true;
}
/** 写一个 JSON 响应; 状态只读, 一律 no-store. */
function sendJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(body));
}
/** 写一个没有响应体的响应. */
function sendEmpty(res, status, allow) {
	res.writeHead(status, allow === void 0 ? {} : { allow });
	res.end();
}
//#endregion
//#region src/path-bootstrap.ts
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
/**
* 引导目录: 常见于 macOS 上 brew, 手动安装的 fish, 以及用户级 CLI 的落点.
* `~` 在运行时按当前 HOME 展开.
*/
const PATH_BOOTSTRAP_DIRS = [
	"/usr/local/bin",
	"/opt/homebrew/bin",
	"~/.local/bin",
	"~/.bun/bin"
];
/**
* 给一份环境补上 PATH 引导目录.
*
* @param env - 原始环境 (一般是 `scrubbedParentEnv()`).
* @param dirs - 引导目录; 默认 {@link PATH_BOOTSTRAP_DIRS}.
* @param home - 用于展开 `~` 的家目录; 默认 `os.homedir()`.
* @returns 新的环境对象; 已经存在的目录不会重复添加.
*/
function withPathBootstrap(env, dirs = PATH_BOOTSTRAP_DIRS, home = homedir()) {
	const current = (env["PATH"] ?? "").split(":").filter((entry) => entry !== "");
	const present = new Set(current);
	const missing = [];
	for (const dir of dirs) {
		const expanded = dir.startsWith("~/") ? join(home, dir.slice(2)) : dir;
		if (present.has(expanded)) continue;
		present.add(expanded);
		missing.push(expanded);
	}
	if (missing.length === 0) return { ...env };
	return {
		...env,
		PATH: [...missing, ...current].join(":")
	};
}
//#endregion
//#region src/stage-output.ts
/**
* 一级 stage 输出的解析.
*
* 约定是 `env -0` 那一类输出: NUL 分隔的 `KEY=VALUE`.
*
* 默认**严格**: 任何不合约定的段都让这一级失败, 免得混进 stdout 的噪声被当成环境值
* 悄悄吞掉. 打开 `filterNoise` 之后改为容错: 不合约定的段被丢弃并计数 (状态行会报告
* 丢了几段), 其中"噪声黏住了下一个变量"这种最常见的情况还会尽力把那一个变量救回来;
* 如果一段合法输出都没有, 仍然算这一级失败.
* @module dsh-load-shell-env/stage-output
*/
/** 输出不符合约定. */
var StageOutputError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "StageOutputError";
	}
};
/**
* 按选项解析一级 stage 的 stdout.
* @param stdout - 该级进程的完整 stdout.
* @param options - 解析选项; 默认严格.
* @returns 环境映射与丢弃的噪声段数.
* @throws StageOutputError 严格模式下出现不合约定的段, 或容错模式下没解析出任何变量.
*/
function parseStageOutputWithReport(stdout, options = {}) {
	const filterNoise = options.filterNoise === true;
	const segments = stdout.toString("utf8").split("\0");
	const env = {};
	let skipped = 0;
	for (const [index, segment] of segments.entries()) {
		if (segment === "") {
			if (index === segments.length - 1) continue;
			if (filterNoise) {
				skipped += 1;
				continue;
			}
			throw new StageOutputError(`empty segment at position ${String(index + 1)}; expected NUL-separated KEY=VALUE pairs without gaps`);
		}
		const parsed = parseSegment(segment);
		if (parsed.ok) {
			env[parsed.name] = parsed.value;
			continue;
		}
		if (!filterNoise) throw new StageOutputError(`segment ${String(index + 1)} ${parsed.reason}: ${describeSegment(segment)}`);
		skipped += 1;
		const recovered = recoverFromNoise(segment);
		if (recovered !== void 0) env[recovered.name] = recovered.value;
	}
	if (filterNoise && skipped > 0 && Object.keys(env).length === 0) throw new StageOutputError(`no KEY=VALUE segment survived; all ${String(skipped)} segment(s) were noise`);
	return {
		env,
		skipped
	};
}
/** 解析一段. */
function parseSegment(segment) {
	const separator = segment.indexOf("=");
	if (separator <= 0) return {
		ok: false,
		reason: "is not KEY=VALUE"
	};
	const name = segment.slice(0, separator);
	if (!ENV_NAME_PATTERN.test(name)) return {
		ok: false,
		reason: "has an invalid variable name"
	};
	return {
		ok: true,
		name,
		value: segment.slice(separator + 1)
	};
}
/** 在被噪声污染的段里找最后一个像变量定义的行. */
function recoverFromNoise(segment) {
	const lines = segment.split("\n");
	for (let index = lines.length - 1; index >= 0; index--) {
		const parsed = parseSegment(lines[index] ?? "");
		if (parsed.ok) return {
			name: parsed.name,
			value: parsed.value
		};
	}
}
/** 截断并转义一段文本用于诊断, 免得一份巨长输出把日志撑开. */
function describeSegment(segment) {
	const clipped = segment.length > 80 ? `${segment.slice(0, 80)}...` : segment;
	return JSON.stringify(clipped);
}
//#endregion
//#region src/stage-runner.ts
/**
* 单级 stage 的执行: `/bin/sh -c <命令>`, 带超时与输出上限.
*
* 这一层只负责"跑一条命令并把它的 stdout 按约定解析出来"; 累积与失败保留策略
* 属于 pipeline. 进程用 `detached` 起成自己的进程组, 这样超时或取消时能连
* `fish -c ...` 拉起来的子孙一起杀掉, 不会留下孤儿.
* @module dsh-load-shell-env/stage-runner
*/
/** 一级 stage 失败了; 消息是可以直接给 user 看的一句话. */
var StageRunError = class extends Error {
	kind;
	stderr;
	/**
	* @param message - 一句话摘要.
	* @param kind - 失败分类.
	* @param stderr - 该级 stderr 的尾部 (可能为空), 只用于诊断.
	*/
	constructor(message, kind, stderr) {
		super(message);
		this.kind = kind;
		this.stderr = stderr;
		this.name = "StageRunError";
	}
};
/**
* 执行一级 stage.
* @param request - 命令, 环境, 超时与取消信号.
* @returns 解析后的环境与 stderr 尾部.
* @throws StageRunError 进程起不来, 退出码非 0, 超时, 被取消, 输出超限或不符合约定.
*/
function runStage(request) {
	const startedAt = Date.now();
	const child = spawn("/bin/sh", ["-c", request.command], {
		env: request.env,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		],
		detached: true
	});
	return new Promise((resolve, reject) => {
		const chunks = [];
		let stdoutBytes = 0;
		let stderrTail = "";
		let failure;
		let settled = false;
		let timer;
		/** 只在第一次结算, 并清掉计时器与 abort 监听. */
		const settle = (finish) => {
			if (settled) return;
			settled = true;
			if (timer !== void 0) clearTimeout(timer);
			request.signal?.removeEventListener("abort", onAbort);
			finish();
		};
		const fail = (kind, message) => {
			failure = {
				kind,
				message
			};
			killGroup(child);
		};
		const onAbort = () => {
			fail("aborted", "cancelled before the stage finished");
		};
		child.stdout?.on("data", (chunk) => {
			if (failure !== void 0) return;
			stdoutBytes += chunk.length;
			if (stdoutBytes > 4194304) {
				fail("output-too-large", `stdout exceeded ${String(MAX_STAGE_OUTPUT_BYTES)} bytes`);
				return;
			}
			chunks.push(chunk);
		});
		child.stderr?.on("data", (chunk) => {
			stderrTail = tail(stderrTail + chunk.toString("utf8"), MAX_STAGE_STDERR_BYTES);
		});
		child.on("error", (error) => {
			settle(() => {
				reject(new StageRunError(`could not start /bin/sh: ${error.message}`, "spawn", stderrTail));
			});
		});
		child.on("close", (code, signal) => {
			settle(() => {
				const elapsed = Date.now() - startedAt;
				if (failure !== void 0) {
					reject(new StageRunError(failure.message, failure.kind, stderrTail));
					return;
				}
				if (code !== 0) {
					reject(new StageRunError(`the stage failed with ${signal === null ? `exit code ${String(code)}` : `signal ${signal}`}`, "exit", stderrTail));
					return;
				}
				try {
					const parsed = parseStageOutputWithReport(Buffer.concat(chunks), { filterNoise: request.filterNoise === true });
					resolve({
						env: parsed.env,
						skipped: parsed.skipped,
						stderr: stderrTail,
						durationMs: elapsed
					});
				} catch (error) {
					reject(new StageRunError(error instanceof Error ? error.message : String(error), "invalid-output", stderrTail));
				}
			});
		});
		if (request.signal !== void 0) {
			if (request.signal.aborted) onAbort();
			else request.signal.addEventListener("abort", onAbort, { once: true });
		}
		timer = setTimeout(() => {
			fail("timeout", `timed out after ${String(request.timeoutMs)}ms`);
		}, request.timeoutMs);
	});
}
/** 杀掉整个进程组; 拿不到进程组时退回杀直接子进程. */
function killGroup(child) {
	if (child.pid === void 0) return;
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}
/** 只保留文本末尾的 `limit` 个字符. */
function tail(text, limit) {
	return text.length <= limit ? text : text.slice(text.length - limit);
}
/**
* 取文本末尾若干行, 用于失败摘要.
* @param text - 原始 stderr 尾部.
* @param lines - 保留的行数.
* @returns 去掉首尾空行后的尾部若干行.
*/
function tailLines(text, lines) {
	const trimmed = text.trim();
	if (trimmed === "") return "";
	const parts = trimmed.split("\n");
	return parts.slice(Math.max(0, parts.length - lines)).join("\n");
}
//#endregion
//#region src/pipeline.ts
/**
* 环境读取流水线: 顺序累积.
*
* 语义是"第 N 级以第 N-1 级的输出环境作为自己的进程环境": 先跑第 1 级拿到
* env1, 再用 env1 当环境跑第 2 级拿到 env2, 依此类推; 进程之间没有父子关系
* (不是套娃 shell). 只有最后一级成功的结果成为快照.
* @module dsh-load-shell-env/pipeline
*/
/** 流水线失败: 记录失败的行号与命令, 便于配置页直接指出来. */
var PipelineError = class extends Error {
	stage;
	command;
	kind;
	/**
	* @param message - 一句话摘要 (含 stderr 尾部若干行).
	* @param stage - 失败的行号 (与配置页一致, 1 起).
	* @param command - 失败那一级的命令原文.
	* @param kind - 失败分类.
	*/
	constructor(message, stage, command, kind) {
		super(message);
		this.stage = stage;
		this.command = command;
		this.kind = kind;
		this.name = "PipelineError";
	}
};
/**
* 顺序执行流水线.
*
* 每一级失败即整次读取失败: 不产生新快照, 由调用方保留上一次成功的结果.
* @param request - 级列表, 初始环境, 超时与取消信号.
* @returns 最后一级的环境与耗时.
* @throws PipelineError 某一级失败.
*/
async function runPipeline(request) {
	const startedAt = Date.now();
	let env = request.baseEnv;
	let snapshot = {};
	let skipped = 0;
	for (const stage of request.stages) {
		let result;
		try {
			result = await runStage({
				command: stage.command,
				env,
				timeoutMs: request.timeoutMs,
				...request.signal === void 0 ? {} : { signal: request.signal },
				...request.filterNoise === void 0 ? {} : { filterNoise: request.filterNoise }
			});
		} catch (error) {
			if (error instanceof StageRunError) throw new PipelineError(composeFailureMessage(error), stage.index, stage.command, error.kind);
			throw error;
		}
		env = result.env;
		snapshot = result.env;
		skipped += result.skipped;
	}
	return {
		env: snapshot,
		durationMs: Date.now() - startedAt,
		stageCount: request.stages.length,
		skipped
	};
}
/** 把一句话摘要与 stderr 尾部拼成可展示的失败消息. */
function composeFailureMessage(error) {
	const diagnostic = tailLines(error.stderr, 6);
	return diagnostic === "" ? error.message : `${error.message}: ${diagnostic}`;
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
//#region src/shell-env-store.ts
/**
* 快照与状态机: 什么时候读, 读失败怎么办, 以及往子进程里注什么.
*
* 三条约束来自设计:
* - 同一时刻只有一次读取在飞, 并发的刷新请求复用同一次读取, 不排队堆积;
* - 某一级失败时整次读取失败, 保留上一次成功的快照, 状态置为 failed;
* - `enabled` 由真变假时立刻清空快照, 命令马上回到继承环境.
*
* 快照只在内存, 不落盘.
* @module dsh-load-shell-env/shell-env-store
*/
/**
* 环境快照与注入层的所有者.
*
* 注入层的优先级 (低到高): 继承环境 < 白名单命中的快照值 < 自定义 env;
* executor 会把这一层整体叠在 `spec.env` 之上, 而 `dshEnv` 仍然最高 (由
* `bash-local` 的 spawnSpec 保证).
*/
var ShellEnvStore = class {
	options;
	baseEnv;
	pipeline;
	logger;
	now;
	config;
	signature = "";
	snapshot;
	injection = {};
	importedNames = [];
	state = initialStatus(false);
	inflight;
	rerun = false;
	cachedBaseEnv;
	constructor(options) {
		this.options = options;
		this.baseEnv = options.baseEnv ?? (() => this.cachedBaseEnv ??= withPathBootstrap(scrubbedParentEnv()));
		this.pipeline = options.runPipeline ?? runPipeline;
		this.logger = options.logger;
		this.now = options.now ?? (() => /* @__PURE__ */ new Date());
	}
	/**
	* 应用一份新配置.
	*
	* 关闭时立刻清空快照; 打开且配置有变化时重新读一次. 读取还在飞的时候到达的
	* 配置变化会在这次读完后补一次读取, 保证生效的配置与状态一致.
	* @param config - 归一化后的配置.
	*/
	applyConfig(config) {
		const signature = signatureOf(config);
		const changed = signature !== this.signature || this.config === void 0;
		this.config = config;
		this.signature = signature;
		if (!config.enabled) {
			this.disable();
			return;
		}
		try {
			this.recomputeInjection(config);
		} catch (error) {
			this.reportConfigError(error);
			return;
		}
		if (!changed && this.snapshot !== void 0) return;
		if (this.inflight !== void 0) {
			this.rerun = true;
			return;
		}
		this.refresh("config");
	}
	/**
	* 手动或按配置重读一次环境.
	* @param trigger - 触发来源.
	* @returns 这次读取结束后的状态; 已有读取在飞时直接复用它.
	*/
	refresh(trigger) {
		const config = this.config;
		if (config === void 0 || !config.enabled) {
			this.disable();
			return Promise.resolve(this.state);
		}
		this.inflight ??= this.performRead(trigger).finally(() => {
			this.inflight = void 0;
			if (this.rerun && this.config?.enabled === true) {
				this.rerun = false;
				this.refresh("config");
			}
		});
		return this.inflight;
	}
	/** 当前状态 (只读快照). */
	status() {
		return this.state;
	}
	/** 当前要注入子进程的环境层; 没有可注入的东西时是空对象. */
	injectedEnv() {
		return this.injection;
	}
	/** 配置不合法时的状态处理: 保留上一次可用的注入层, 只把状态置为失败. */
	reportConfigError(error) {
		const message = error instanceof Error ? error.message : String(error);
		this.logger?.warn(`shell env config is not usable: ${message}`);
		this.state = {
			phase: "failed",
			enabled: this.config?.enabled ?? false,
			importedCount: this.importedNames.length,
			importedNames: [...this.importedNames],
			error: { message }
		};
	}
	/** 关掉总开关: 清空快照与注入层. */
	disable() {
		this.snapshot = void 0;
		this.injection = {};
		this.importedNames = [];
		this.state = initialStatus(false);
	}
	/** 真正跑一次读取. */
	async performRead(trigger) {
		const config = this.config;
		if (config === void 0 || !config.enabled) return this.state;
		const startedAt = Date.now();
		this.state = {
			phase: "reading",
			enabled: true,
			importedCount: this.importedNames.length,
			importedNames: [...this.importedNames]
		};
		try {
			let snapshot = {};
			let durationMs = 0;
			let skipped = 0;
			if (config.stages.length > 0) {
				const result = await this.pipeline({
					stages: config.stages,
					baseEnv: this.baseEnv(),
					timeoutMs: config.envTimeoutMs,
					filterNoise: config.filterNoise
				});
				snapshot = result.env;
				durationMs = result.durationMs;
				skipped = result.skipped;
			}
			this.snapshot = snapshot;
			this.recomputeInjection(config);
			this.state = {
				phase: "ready",
				enabled: true,
				lastReadAt: this.now().toISOString(),
				durationMs,
				importedCount: this.importedNames.length,
				importedNames: [...this.importedNames],
				...skipped > 0 ? { skippedSegments: skipped } : {}
			};
			this.logger?.info(`shell env snapshot refreshed (${trigger}): ${String(this.importedNames.length)} variables from ${String(config.stages.length)} stage(s) in ${String(durationMs)}ms${skipped > 0 ? `, ${String(skipped)} noise segment(s) dropped` : ""}`);
		} catch (error) {
			this.state = {
				phase: "failed",
				enabled: true,
				durationMs: Date.now() - startedAt,
				importedCount: this.importedNames.length,
				importedNames: [...this.importedNames],
				error: failureOf(error)
			};
			this.logger?.warn(`shell env read failed (${trigger}): ${this.state.error?.message ?? "unknown error"}`);
		}
		return this.state;
	}
	/** 按白名单与自定义 env 重算注入层. */
	recomputeInjection(config) {
		assertCustomEnvNames("customEnv", config.customEnv);
		const snapshot = this.snapshot ?? {};
		const whitelisted = {};
		for (const name of config.importNames) {
			const value = snapshot[name];
			if (value !== void 0) whitelisted[name] = value;
		}
		const custom = applyCustomEnv(parseCustomEnv(config.customEnv), {
			...this.baseEnv(),
			...whitelisted
		});
		this.injection = {
			...whitelisted,
			...custom
		};
		this.importedNames = Object.keys(this.injection).sort();
	}
};
/** 配置指纹: 决定一次 volatile 更新是否需要重读. */
function signatureOf(config) {
	return JSON.stringify({
		enabled: config.enabled,
		envTimeoutMs: config.envTimeoutMs,
		importNames: config.importNames,
		customEnv: config.customEnv,
		filterNoise: config.filterNoise,
		stages: config.stages
	});
}
/** 把失败对象收敛成状态里的摘要. */
function failureOf(error) {
	if (error instanceof PipelineError) return {
		stage: error.stage,
		command: error.command,
		message: error.message
	};
	if (error instanceof ShellEnvConfigError) return { message: error.message };
	return { message: error instanceof Error ? error.message : String(error) };
}
//#endregion
//#region src/index.ts
/** 插件模块名 (也是 Loader row id 去前缀后的写法). */
const name = PLUGIN_NAME;
/**
* 环境同步与命令执行.
*
* 除了 `resolve()` 之外的行为都继承父类: 沙箱策略, 审批边界, 输出上限,
* 后台进程管理一律不变.
*/
var ShellEnvExecutor = class extends SandboxBashExecutor {
	config;
	static inject = [
		"subprocess",
		"sandbox",
		"sandboxPolicy"
	];
	static Config = Config;
	/**
	* 环境快照的状态面: 路由与外部诊断都通过它读状态, 触发重读.
	* 读取本身是单飞的, 重复调用只会复用同一次.
	*/
	shellEnv;
	store;
	/**
	* @param ctx - 宿主插件上下文.
	* @param config - schema 解析后的活动配置 (父类只认识 executor 那六个旋钮).
	*/
	constructor(ctx, config) {
		super(ctx, config);
		this.config = config;
		this.store = new ShellEnvStore({
			readConfig: () => readShellEnvConfig(config),
			logger: {
				info: (message) => {
					ctx.logger.info(message);
				},
				warn: (message) => {
					ctx.logger.warn(message);
				}
			}
		});
		try {
			validateShellEnvConfig(config);
		} catch (error) {
			if (config.enabled.get()) throw error;
			const message = error instanceof Error ? error.message : String(error);
			ctx.logger.warn(`dsh-load-shell-env: disabled with an unusable configuration, staying inert: ${message}`);
		}
		this.store.applyConfig(readShellEnvConfig(config));
		this.shellEnv = {
			status: () => this.store.status(),
			refresh: () => this.store.refresh("manual")
		};
		ctx.on("loader/volatile-update", () => {
			this.syncConfig();
		});
		ctx.inject(["webServer"], (webCtx) => {
			mountShellEnvRoutes(webCtx, this.shellEnv);
		});
	}
	/**
	* 把当前生效的注入层叠进解析后的 spec.
	*
	* 插件注入压过调用方显式传入的 `env`; `dshEnv` 仍然最高 (由 bash-local 的
	* spawnSpec 在更后面合并). 没有可注入的东西时原样返回父类结果.
	* @param request - 调用方的执行请求.
	* @returns 合并了环境层的执行规格.
	*/
	resolve(request) {
		const spec = super.resolve(request);
		const injected = this.store.injectedEnv();
		if (Object.keys(injected).length === 0) return spec;
		const env = {
			...spec.env,
			...injected
		};
		return {
			...spec,
			env
		};
	}
	/** 按最新配置同步一次: 关闭时清空, 打开时校验并重读. */
	syncConfig() {
		if (!this.config.enabled.get()) {
			this.store.applyConfig(readShellEnvConfig(this.config));
			return;
		}
		try {
			validateShellEnvConfig(this.config);
		} catch (error) {
			this.store.reportConfigError(error);
			return;
		}
		this.store.applyConfig(readShellEnvConfig(this.config));
	}
};
//#endregion
export { Config, PACKAGE_NAME, PLUGIN_NAME, REFRESH_PATH, STATUS_PATH, ShellEnvConfigError, ShellEnvExecutor, ShellEnvExecutor as default, name, validateShellEnvConfig };

//# sourceMappingURL=index.mjs.map
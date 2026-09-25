# dsh-load-shell-env

[English](README.md) | 中文

把**你自己的 shell 环境** (fish / zsh / bash 的配置) 带进 DSH agent 执行的命令里.

macOS 上从 Finder 或 Dock 启动的 DSH 桌面版继承的是 launchd 给 GUI 应用的默认环境:
`PATH` 通常只有 `/usr/bin:/bin:/usr/sbin:/sbin`, 于是 `node`, `pnpm`, `uv`, `cargo`,
`rg`, `brew` 在 agent 的命令里全都找不到, 而你在集成终端里看到的 `PATH` 是正常的
(那是 `fish -i` 自己读配置的结果). 这个插件让你把那份环境读出来, 注入到 agent 每条
bash 命令里, **不改命令文本**: argv 仍然是 `bash -c <command>`.

## 它做什么

- 一个**默认关闭**的总开关. 没打开之前, 插件一条命令都不跑, 也不注入任何变量.
- 一条**有序流水线**: 每级是一条完整的 `sh` 命令, 必须自己输出 NUL 分隔的
  `KEY=VALUE` (最典型的一级就是 `fish -l -i -c 'env -0'`), 逐级累积.
- 一份**导入名单**: 只把点名的变量注入子进程, 默认只有 `PATH`.
- 一份**自定义 env**: `.env` 风格的手写覆盖层, 支持 `$VAR` / `${VAR}` 展开与删除.
- 配置页上的**状态行与手动刷新**, 带最近一次读取的时间, 耗时, 注入的变量名与失败原因.

## 它不做什么

- 不管集成终端 (它本来就跑你的 shell, 不需要修).
- 不改 Agent 循环, 不改工具 schema, 不改系统提示词, 也没有给模型准备任何 tool.
- 不落盘任何环境值: 快照只在内存, HTTP 接口只返回状态与变量名.
- 不接管 MCP stdio server 或其它插件自己 spawn 的进程 (它们不走 `ctx.shell`).
- 首版不支持 Windows (原因见下面的"实现要点").

## 安装

在应用内的插件管理器里安装并重启 (桌面版的 profile 只能由应用管理):

```shell
dsh plugin --profile web add azazo1/dsh-load-shell-env
```

想固定版本就用 `azazo1/dsh-load-shell-env#v0.1.0`. 安装后 **重启 DSH**: 插件的
bundle patch 要参与启动时的组合.

## 配置

插件在 Plugins 页上有自己的配置卡片, 也可以直接在 profile 的 `cordis.patch.yml`
里写 (行 id 是 `load-shell-env`):

```yaml
- id: load-shell-env
  config:
    enabled: true
    stages:
      - { command: "fish -l -i -c 'env -0'", enabled: true }
      - { command: "bash -l -i -c 'env -0'", enabled: false }
    importNames: [PATH]
    customEnv: |
      # 这一层排在流水线之后
      PATH=$PATH:$HOME/.local/bin
      GOPATH=$HOME/go
    envTimeoutMs: 10000
    # 以下是 executor 自己的旋钮, 与原 bash-sandbox 行同义
    timeoutMs: 60000
```

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `enabled` | `false` | 总开关. 打开**并保存**之后才会去读; 关掉立刻清空快照, 命令回到继承环境. |
| `stages` | `[]` | 流水线. 每项 `{ command, enabled }`, `enabled` 省略按 `true` 算. |
| `importNames` | `['PATH']` | 允许注入子进程的变量名; 不允许 `DSH_` 前缀. |
| `customEnv` | `''` | `.env` 风格文本, 排在流水线之后. |
| `envTimeoutMs` | `10000` | **每一级**各自的超时 (毫秒). |
| `filterNoise` | `false` | 输出容错: 丢弃不符合约定的输出段并继续 (状态行报告丢了几段), 而不是让该级失败. |

### 流水线与累积语义

第 N 级以第 N-1 级的输出环境作为自己的进程环境 (进程之间没有父子关系, 不是嵌套
shell), 只有最后一级的结果成为快照.

第一级看到的是 Host 的继承环境, 但会先补上几个约定俗成的用户工具链目录
(`/usr/local/bin`, `/opt/homebrew/bin`, `~/.local/bin`, `~/.bun/bin`): launchd 给 GUI
应用的 `PATH` 里连 `/usr/local/bin/fish` 都没有, 不补的话默认那一级自己就找不到 fish.
只补 `PATH` 里还缺的那些, 也只影响读取用的子进程, 注入结果仍然来自你的 shell 自己
输出的东西.

每一级都必须自己输出约定格式:

```shell
fish -l -i -c 'env -0'
```

- 按 NUL 切分, 只忽略末尾的空段; 任何不合约定的段都让**这一级失败** (不做宽松丢弃,
  免得混进 stdout 的噪声被当成环境值吞掉).
- 退出码非 0 / 超时 / 输出不合约定, 都让**整次读取失败**: 保留上一次成功的快照,
  状态置为失败并指出是第几级 (行号与配置页上看到的行号一致) 与 stderr 尾部几行.
- 打开开关但一级都没启用时, 不跑命令, 快照为空, 只应用自定义 env.

**噪声**: 你的 shell 配置如果在启动时往 stdout 打字 (提示语, 进度, 代理状态等等), 那行字会和 `env -0` 的输出挤在一起, 有时甚至黏在下一个变量名前面 (`Proxy on ... set\nSTARSHIP_SHELL=...`), 严格模式下这一级就失败. 正确的修法是把那条消息改成写 stderr (fish 里就是 `echo ... >&2`); 实在改不动来源时, 可以打开 `filterNoise` 让插件丢弃这类段并计数 —— 但它只救得了"黏在变量名前面"的形态, 噪声如果糊进了某个变量的值里, 任何解析器都看不出来.

### 自定义 env

```shell
# 空行与 # 开头的行忽略
PATH=$PATH:$HOME/.local/bin
GOPATH=$HOME/go
DROP=
```

- 每行 `KEY=VALUE`, 值两侧成对的引号会被去掉.
- 支持 `$VAR` 与 `${VAR}`; 未定义展开成空串; `\$` 是字面量 `$`; 不做命令替换与算术展开.
- 展开时看到的是"继承环境 + 白名单命中的快照值"再叠上**本文件里前面几条**的结果,
  所以 `PATH=$PATH:...` 按直觉工作.
- `KEY=` (等号右侧为空) 表示把该变量从命令环境里**删除**, 而不是设成空串.
- 变量名同样不允许 `DSH_` 前缀: 那是 harness 自己每次执行现造的事实命名空间.

### 状态与刷新

卡片底部的状态行显示阶段 (未启用 / 尚未读取 / 正在读取 / 成功 / 失败), 最近一次读取的
时间与耗时, 当前注入的变量名, 以及失败时是第几级出了什么事. 右侧的 `刷新` 走插件自己
注册的一条路由 (`POST /api/plugins/dsh-load-shell-env/refresh`), 手动重读一次;
`GET .../status` 只读状态. 两条路由都**不返回任何变量值**.

### 优先级

子进程最终环境从低到高:

1. Host 的继承环境 (已经过滤掉 `*KEY* / *PASSWORD* / *SECRET* / *TOKEN*` 形状的名字与 `DSH_*`);
2. dsh 为工具输出准备的一组覆盖 (`NO_COLOR=1`, `TERM=dumb`, `PAGER=cat`, `GIT_PAGER=cat`);
3. 白名单命中的快照值;
4. 自定义 env (可以覆盖上面任何一层, 也可以删除);
5. `DSH_*` 事实 (永远最高, 由 harness 自己写).

注意第 3/4 层压在第 2 层之上: 如果你把 `TERM` / `PAGER` / `GIT_PAGER` / `NO_COLOR`
写进名单或自定义 env, 就会盖掉 dsh 为工具输出准备的取值 (可能让命令挂住或输出变脏).
插件不拦你, 但知道这回事有好处.

## executor 旋钮与官方 shell 卡片

`ctx.shell` 是**单实现**服务, 一个上下文里只能有一个 backend, 所以插件必须让内置的
`bash-sandbox` 行停下来, 再插入自己那一行 (插件自带的 bundle patch 就是干这个的).
副作用是: 官方那张 shell 设置卡片 (`packages/client/ui-settings-shell`) 的显示条件是
"`bash-sandbox` 或 `pwsh-sandbox` 被服务", 两个都停掉之后它会**自己退场**, 那六个
执行旋钮 (命令超时, 输出上限等) 也就没有界面入口了.

本插件**没有**把那些入口搬进自己的卡片 (它只管环境同步). 需要调这些值的部署直接写
profile patch, 字段与原来的 `bash-sandbox` 行同义:

```yaml
- id: load-shell-env
  config:
    # 整行 config 是整体替换, 想保留的字段都要重述
    timeoutMs: 60000
    maxTimeoutMs: 600000
    maxOutputBytes: 64000
    maxSpillBytes: 67108864
    graceMs: 3000
    cwd: /path/to/workspace
```

## 实现要点

- **继承 `SandboxBashExecutor`**. 只覆写 `resolve()` 把环境层合并进 `spec.env`,
  `execute()` 与 confinement 完全交给父类: workspace-write / read-only 的文件边界,
  沙箱拒绝分类, 后台进程管理, 输出上限都不变.
- **配置 schema 是 executor Config 的超集**. 自己定义 `static Config` 会遮蔽继承来的
  schema, 于是 `timeoutMs` 这类字段写进 profile patch 也会被静默丢掉, 所以插件 schema
  把 executor 的六个字段原样拼进来 (默认值与原版一致, 有单测盯着).
- **Windows 上不生效**. base bundle 在 Windows 用 `pwsh-sandbox` 占着同一个
  `ctx.shell` 服务, 插件再插一行会让两个 provider 抢服务, 结果是 Host 启动失败.
  所以插入的那一行带 `disabled: !!js process.platform === 'win32'`, Windows 上插件
  "装了但不生效", 配置卡片也不会出现.
- **读取发生在 Host 进程**. 打开开关后执行的是你自己的 shell 配置, 不受 workspace-write
  约束 (它本来也不该受: 那是 agent 命令的边界). 这是你显式开启后的预期行为.

## 排错

- **Host 起不来, 日志里说 `ctx.shell` 重复注册**: 说明内置的 `bash-sandbox` 行没有
  被停掉 (通常是内置行改了名字, patch 匹配不到只会告警然后跳过). 在应用里禁用本插件
  即可恢复原生组合, 然后把内置 row id 反馈过来.
- **卡片上没有配置区**: Host 没有组合这一行 (Windows 上就是这种情况), 或者插件没有被
  加进 profile 的 bundle 栈. 检查 `dsh --profile <name> --dump-config` 里
  `load-shell-env` 是否 ACTIVE, `bash-sandbox` 是否 disabled.
- **状态一直是"尚未读取"**: 开关没保存, 或者 Host 侧还没开始读.
- **状态"上次读取失败"**: 看状态行给出的级号与 stderr 摘要. 常见原因是那一级没有按
  约定输出 NUL 分隔的 `KEY=VALUE` (例如把交互式 shell 的提示符一起打进了 stdout),
  或者超时 (读 shell 配置太慢就调大 `envTimeoutMs`).
- **`PATH` 对了但命令还是找不到工具**: 检查 `importNames`: 只有名单里的名字会被注入.
- **默认那一级报 fish 找不到**: PATH 引导只覆盖那四个约定目录; 你的 shell 装在别处时,
  把命令写成绝对路径, 例如 `/usr/local/bin/fish -l -i -c 'env -0'`.
- **状态行 failed, 摘要里出现 `is not KEY=VALUE` 或 `invalid variable name`**: 读取时 stdout
  混进了别的东西 (见"噪声"一段). 先把那条消息改成写 stderr; 改不动来源就打开"输出容错"并保存.

## 开发

```shell
just install     # 安装依赖
just typecheck   # tsc --noEmit
just build       # Host ESM + Client loader bundle
just test        # vitest
just verify      # typecheck + build + test + 命名清单校验
just names       # 只跑命名清单的离线校验
```

源码在 `src/`: Host 半区是 `index.ts` (executor), `config.ts` (schema 与校验),
`pipeline.ts` / `stage-runner.ts` / `stage-output.ts` (读取), `custom-env.ts` (自定义
env), `shell-env-store.ts` (快照与状态机), `routes.ts` (两条路由); Client 半区在
`src/client/`.

测试分两层: `test/*.spec.ts` 是单元测试 (解析, 累积, 展开, 状态机, 路由, 命名,
bundle 注册, 以及用真 patch 实现跑一遍 `cordis.patch.yml`), `test/executor.e2e.spec.ts`
用真 provider 起一个最小组合, 验证环境真的进了子进程而 argv 没变 (本机起不了
confinement runner 时, 沙箱那一项会显式跳过).

样式没有用 CSS Modules: 外部插件的 tsdown 构建里没有 CSS 预设, 所以卡片样式以
`data-plugin-css` 标记注入一次 (与官方预设的去重标记同一个键), 只用 `--dsw-alias-*`
语义 token.

## 许可

MIT

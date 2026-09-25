# dsh-load-shell-env

English | [中文](README.zh.md)

Bring **your own shell environment** (fish / zsh / bash config) into the commands the DSH
agent runs.

On macOS, a DSH Desktop launched from Finder or the Dock inherits the launchd environment
for GUI applications: `PATH` is usually just `/usr/bin:/bin:/usr/sbin:/sbin`, so `node`,
`pnpm`, `uv`, `cargo`, `rg` and `brew` are all missing inside agent commands, even though the
integrated terminal looks fine (that one runs `fish -i`, which reads your config itself).
This plugin reads that environment once and injects it into every bash command the agent
runs, **without touching the command text**: argv stays `bash -c <command>`.

## What it does

- A master switch that is **off by default**. Until you turn it on, the plugin runs no
  command and injects nothing.
- An **ordered pipeline**: each stage is a complete `sh` command that must print
  NUL-separated `KEY=VALUE` itself (the canonical stage is `fish -l -i -c 'env -0'`), and
  stages accumulate in order.
- An **import list**: only named variables are injected into child processes, `PATH` alone by
  default.
- A **custom env**: a hand-written `.env`-style overlay with `$VAR` / `${VAR}` expansion and
  deletion.
- A **status row and manual refresh** on the settings card, showing when the last read
  happened, how long it took, which names are injected, and why a read failed.

## What it does not do

- It does not touch the integrated terminal (it already runs your shell).
- It does not change the agent loop, tool schemas or the system prompt, and exposes no tool
  to the model.
- It persists no environment value: the snapshot lives in memory and the HTTP routes return
  status and names only.
- It does not cover MCP stdio servers or processes other plugins spawn themselves (they do
  not go through `ctx.shell`).
- Windows is unsupported in this release (see "Implementation notes").

## Install

Install it through the in-app plugin manager and restart (the Desktop profile is managed by
the application):

```shell
dsh plugin --profile web add azazo1/dsh-load-shell-env
```

Pin a version with `azazo1/dsh-load-shell-env#v0.1.0`. **Restart DSH afterwards**: the
bundle patch takes part in the boot composition.

## Configuration

The plugin has its own card on the Plugins page, and the same values can be written directly
in the profile's `cordis.patch.yml` (the row id is `load-shell-env`):

```yaml
- id: load-shell-env
  config:
    enabled: true
    stages:
      - { command: "fish -l -i -c 'env -0'", enabled: true }
      - { command: "bash -l -i -c 'env -0'", enabled: false }
    importNames: [PATH]
    customEnv: |
      # this layer applies after the pipeline
      PATH=$PATH:$HOME/.local/bin
      GOPATH=$HOME/go
    envTimeoutMs: 10000
    # executor knobs below, same meaning as on the stock bash-sandbox row
    timeoutMs: 60000
```

| Field | Default | Meaning |
| --- | --- | --- |
| `enabled` | `false` | Master switch. Only turning it on **and saving** triggers a read; turning it off clears the snapshot immediately and commands fall back to the inherited environment. |
| `stages` | `[]` | The pipeline. Each entry is `{ command, enabled }`; a missing `enabled` counts as `true`. |
| `importNames` | `['PATH']` | Names allowed into child processes; the `DSH_` prefix is rejected. |
| `customEnv` | `''` | `.env`-style text, applied after the pipeline. |
| `envTimeoutMs` | `10000` | Timeout of **each** stage, in milliseconds. |
| `filterNoise` | `false` | Output tolerance: drop segments that do not follow the convention and keep going (the status row reports how many were dropped) instead of failing the stage. |

### Pipeline and accumulation

Stage N runs with stage N-1's output as its environment (there is no parent/child nesting,
these are sequential processes), and only the last successful stage's output becomes the
snapshot.

Stage 1 sees the Host's inherited environment, first augmented with a few conventional user
toolchain directories (`/usr/local/bin`, `/opt/homebrew/bin`, `~/.local/bin`, `~/.bun/bin`):
the launchd `PATH` a GUI app gets does not even contain `/usr/local/bin/fish`, so without
that bootstrap the default stage could not find fish at all. Only directories missing from
`PATH` are added, and only the reading subprocesses see them; what gets injected still comes
from what your own shell prints.

Every stage must print the agreed format itself:

```shell
fish -l -i -c 'env -0'
```

- Output is split on NUL and only a trailing empty segment is ignored; any segment that does
  not follow the convention fails **that stage** (no lenient dropping, so noise mixed into
  stdout cannot be swallowed as an environment value).
- A non-zero exit, a timeout or unparseable output fails the **whole read**: the last
  successful snapshot is kept, the status turns failed and names the stage (the number
  matches the row you see on the settings card) plus the last few lines of stderr.
- With the switch on but no enabled stage, no command runs, the snapshot is empty and only
  the custom env applies.

**Noise**: when your shell config prints something to stdout while it loads (a notice, a
progress line, a proxy status), that text interleaves with `env -0`'s output and sometimes
glues itself in front of the next variable name (`Proxy on ... set\nSTARSHIP_SHELL=...`),
which fails the stage under the strict default. The right fix is at the source: write that
message to stderr (`echo ... >&2` in fish). When the source cannot be changed, turn on
`filterNoise` and the plugin drops such segments and counts them - but it only recovers the
"glued in front of a name" shape; noise written into a value is invisible to any parser.

### Custom env

```shell
# blank lines and lines starting with # are ignored
PATH=$PATH:$HOME/.local/bin
GOPATH=$HOME/go
DROP=
```

- One `KEY=VALUE` per line; paired quotes around the value are stripped.
- `$VAR` and `${VAR}` expand, an undefined variable expands to the empty string, `\$` is a
  literal `$`, and there is no command substitution or arithmetic expansion.
- Expansion sees the inherited environment plus the whitelisted snapshot values, plus the
  **earlier lines of this same text**, so `PATH=$PATH:...` behaves as expected.
- `KEY=` (empty right-hand side) **removes** that variable from the command environment
  instead of setting it empty.
- Names with the `DSH_` prefix are rejected: that namespace holds the facts the harness
  builds for each execution.

### Status and refresh

The status row shows the phase (disabled / not read yet / reading / succeeded / failed),
the time and duration of the last read, the names currently injected, and, on failure, which
stage failed and what happened. The `Refresh` button calls a route the plugin registers
itself (`POST /api/plugins/dsh-load-shell-env/refresh`) to read once more; `GET .../status`
only reads. Neither route **returns any variable value**.

### Precedence

The final child environment, lowest to highest:

1. the Host's inherited environment (credential-shaped names and `DSH_*` already scrubbed);
2. the overrides dsh sets up for tool output (`NO_COLOR=1`, `TERM=dumb`, `PAGER=cat`,
   `GIT_PAGER=cat`);
3. whitelisted snapshot values;
4. the custom env (it can override or delete anything above);
5. `DSH_*` facts (always highest, written by the harness itself).

Note that layers 3 and 4 sit above layer 2: putting `TERM` / `PAGER` / `GIT_PAGER` /
`NO_COLOR` into the import list or the custom env overrides what dsh prepared for tool output
(commands may hang or produce dirty output). The plugin does not stop you, but it is worth
knowing.

## Executor knobs and the official shell card

`ctx.shell` is a **single-implementation** service, so the plugin has to stop the stock
`bash-sandbox` row and insert its own (that is what the bundled `cordis.patch.yml` does).
One consequence: the official shell settings card (the **Terminal** entry under
"Settings -> Plugins -> Official") renders only while `bash-sandbox` or `pwsh-sandbox` is
served, so once both are stopped it **retires itself**.

The two controls it used to carry ("Command timeout (ms)" `timeoutMs` and "Output cap per
stream (bytes)" `maxOutputBytes`) now live in a **"Shell" section at the bottom of this
plugin's card**, with the same wording; "Reset" still clears the user layer and falls back to
the composition layer (this plugin's bundle patch sets `timeoutMs: 60000`, and the schema
default for `maxOutputBytes` is `64000`). The other four executor fields (`cwd`,
`maxTimeoutMs`, `maxSpillBytes`, `graceMs`) were never in the UI and remain patch-only:

Deployments can also set every executor field through a profile patch; the fields mean
exactly what they meant on the stock row:

```yaml
- id: load-shell-env
  config:
    # a row's config is replaced wholesale, so restate every field you want to keep
    timeoutMs: 60000
    maxTimeoutMs: 600000
    maxOutputBytes: 64000
    maxSpillBytes: 67108864
    graceMs: 3000
    cwd: /path/to/workspace
```

## Implementation notes

- **It extends `SandboxBashExecutor`** and overrides only `resolve()` to merge the
  environment layer into `spec.env`. `execute()` and confinement stay with the parent, so the
  workspace-write / read-only file boundary, sandbox denial classification, background
  process management and output caps are all unchanged.
- **The config schema is a superset of the executor's Config.** Declaring `static Config`
  shadows the inherited schema, and schemastery projects only declared keys, so without the
  superset a value like `timeoutMs` written into a profile patch would be dropped silently.
  The six executor fields are composed back in with their original defaults, guarded by a
  test.
- **It stays inactive on Windows.** The base bundle gives Windows `pwsh-sandbox`, which
  occupies the same `ctx.shell` service; inserting a second row would make two providers
  fight over it and **fail Host startup**. So the inserted row carries
  `disabled: !!js process.platform === 'win32'`: on Windows the plugin is installed but
  inert, and its settings card does not render.
- **Reading happens in the Host process.** Once enabled, the pipeline executes your own
  shell configuration outside the workspace-write boundary (that boundary governs agent
  commands). This is the expected behaviour of an explicitly enabled switch.

## Troubleshooting

- **Host fails to start, the log mentions a duplicate `ctx.shell` registration**: the stock
  `bash-sandbox` row was not stopped (usually because the built-in row was renamed and a
  patch that matches nothing only warns and is skipped). Disable this plugin in the app to
  restore the stock composition, then report the built-in row id.
- **The card has no configuration section**: the Host did not compose this row (that is the
  Windows case), or the plugin is not in the profile's bundle stack. Check
  `dsh --profile <name> --dump-config`: `load-shell-env` should be active and `bash-sandbox`
  disabled.
- **The status stays "not read yet"**: the switch was not saved, or the Host has not started
  a read.
- **The status says the last read failed**: look at the stage number and the stderr summary.
  The usual causes are a stage that did not print NUL-separated `KEY=VALUE` (for example an
  interactive shell banner mixed into stdout) or a timeout (raise `envTimeoutMs` when reading
  your shell config is slow).
- **`PATH` is right but tools are still missing**: check `importNames`; only listed names are
  injected.
- **The default stage reports that fish is missing**: the PATH bootstrap covers those four
  conventional directories only; when your shell lives elsewhere, spell the command out, for
  example `/usr/local/bin/fish -l -i -c 'env -0'`.
- **The status is failed and the summary says `is not KEY=VALUE` or `invalid variable name`**:
  something else landed on stdout during the read (see the "Noise" note above). Move that
  message to stderr first; if the source cannot be changed, turn on "output tolerance" and
  save.

## Development

```shell
just install     # install dependencies
just typecheck   # tsc --noEmit
just build       # Host ESM + Client loader bundle
just test        # vitest
just verify      # typecheck + build + test + naming manifest validation
just names       # the offline naming manifest validation alone
```

Sources live in `src/`. The Host half is `index.ts` (the executor), `config.ts` (schema and
validation), `pipeline.ts` / `stage-runner.ts` / `stage-output.ts` (reading),
`custom-env.ts` (the custom env layer), `shell-env-store.ts` (snapshot and state machine),
`routes.ts` (the two routes); the Client half is under `src/client/`.

Tests come in two layers: `test/*.spec.ts` covers units (parsing, accumulation, expansion,
the state machine, routes, naming, bundle registration, and `cordis.patch.yml` run through
dsh's own patch implementation), while `test/executor.e2e.spec.ts` boots a minimal
composition with the real providers and proves the environment reaches the child process
while argv stays unchanged (its sandbox assertion skips explicitly where no confinement
runner can start).

Styles are not CSS Modules: an external plugin's tsdown build has no CSS preset, so the card
injects its styles once under the `data-plugin-css` marker (the same dedupe key the official
preset uses) and uses `--dsw-alias-*` semantic tokens only.

## License

MIT

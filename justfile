# 列出可用的 recipe.
[private]
default:
    @just --list

# 安装项目依赖.
install:
    pnpm install

# 执行 TypeScript 类型检查, 不生成文件.
typecheck:
    pnpm exec tsc --noEmit

# 构建 Host ESM bundle 和 Client loader bundle (含类型声明).
build:
    pnpm exec tsdown --config tsdown.host.config.ts
    pnpm exec tsdown --config tsdown.client.config.ts

# 执行项目测试套件.
test:
    pnpm test

# 校验外部插件命名清单 (社区兼容性 profile).
names:
    node ~/.dsh/skills/dsh-plugin-upgrade-skill/skills/plugin-write/scripts/validate-names.mjs --manifest ./dsh-plugin.naming.json --strict

# 预览 npm 包内容 (不落盘), 确认发布的是构建产物而不是源码.
pack:
    pnpm pack --dry-run

# 类型检查, 构建, 测试, 命名校验与打包预览一次完成.
verify:
    just typecheck
    just build
    just test
    just names
    just pack

# 删除 node_modules 与 .tmp .
clean:
    rm -rf .tmp/
    rm -rf node_modules/

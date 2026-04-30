# Agent Profile

家里、公司、甚至网吧，你亲手编写的 `skills`、`agents`、`hooks`、`rules` 散落在各处。

`agent-profile` 把这些配置资产收拢到一个 Git 仓库，一条命令挂载到本地 `~/.claude`。换台电脑拉下仓库执行同步，一处保存处处生效。

- 通过软链接挂载，不覆盖非托管内容
- 支持按场景切换 profile（工作/家庭/不同项目）
- 支持预览、重建、移除和状态查看
- 本机运行状态与仓库内容分离，仓库干净进 Git

## 安装

要求：

- Node.js 20+
- Windows 下如果要创建文件软链接，通常需要管理员权限或开启开发者模式

通过 npm 安装：

```bash
npm install -g @money1998/agent-profile
```

安装后可用命令：

```bash
agent-profile
```

## 快速开始

### 1. 创建目录

```bash
mkdir my-agent-profile
cd my-agent-profile
```

### 2. 初始化

```bash
agent-profile init
```

这会在当前目录创建基础骨架，并注册为这台机器当前激活的配置仓库。

### 3. 编辑配置

```bash
agent-profile config
```

当前 Windows 下会直接用记事本打开配置文件。

### 4. 放入你的配置资产

初始化后的目录结构大致如下：

```text
my-agent-profile/
├── agent-profile.conf
├── assets/
│   ├── skills/
│   ├── rules/
│   ├── agents/
│   ├── hooks/
│   └── plugins/
└── profiles/
```

你可以把通用资产放进 `assets/`，把场景相关资产放进 `profiles/<name>/`。

### 5. 先预览，再同步

```bash
agent-profile sync --dry-run
agent-profile sync
```

## 基本概念

### assets

`assets/` 用于存放通用配置资产。这里的内容始终参与同步。

### profiles

`profiles/<name>/` 表示一个场景配置集，例如：

- `work`
- `home`
- `code`
- `product`

profile 的作用不是单纯“覆盖基础层”，而是让不同场景只加载当前需要的配置资产，避免把全部配置一次性挂进去造成上下文浪费和触发干扰。

规则如下：

- `assets/<dir>/` 始终参与
- 指定 profile 后，`profiles/<profile>/<dir>/` 也参与
- 如果 profile 和 `assets/` 存在同名相对路径，则 profile 优先

### 用户级状态

`agent-profile` 会在用户目录下保存本机状态，用来记录：

- 当前激活的是哪一份配置仓库
- 当前托管了哪些链接

这样仓库内容和本机运行状态是分离的：

- 仓库可以进 Git
- 本机状态不会污染仓库

## 配置文件

配置文件名固定为：

```text
agent-profile.conf
```

示例：

```ini
[profile]
work

[dirs]
skills
rules
agents
hooks
plugins

[exclude]
skills/*-workspace

[claude]
root=C:\Users\you\.claude
```

说明：

- `[profile]`：当前默认 profile，可为空
- `[dirs]`：参与同步的一级目录，工具严格按这里执行
- `[exclude]`：排除规则，匹配相对路径
- `[claude].root`：覆盖默认目标目录；未配置时默认使用 `~/.claude`

只有 `[dirs]` 中声明的目录才会参与同步。你可以在仓库里放其他内容一起管理，但只要不在 `[dirs]` 中，就不会被挂载。

## 命令

查看帮助：

```bash
agent-profile --help
agent-profile sync --help
```

常用命令：

- 初始化仓库：`agent-profile init`
- 打开配置：`agent-profile config`
- 查看状态：`agent-profile status`
- 正式同步：`agent-profile sync`
- 预览同步：`agent-profile sync --dry-run`
- 使用指定 profile：`agent-profile sync --profile work`
- 重建全部挂载：`agent-profile sync --rebuild`
- 移除单项：`agent-profile remove skills/mary`
默认会把该路径写入 `exclude`，避免下次同步时又挂回来。
- 临时移除单项：`agent-profile remove skills/mary --once`
- 移除全部：`agent-profile remove --all`
- 解绑当前仓库：`agent-profile detach`
执行 `detach` 前，如果当前仍有托管项，需要先执行 `agent-profile remove --all`。

## 安全与行为约束

- 工具不会覆盖非托管内容
- 冲突项会被保留并明确提示
- `remove` 必须显式指定路径或使用 `--all`
- `detach` 只负责解绑当前仓库，不负责自动移除链接
- 如果当前没有激活仓库，业务命令会提示先执行 `agent-profile init`


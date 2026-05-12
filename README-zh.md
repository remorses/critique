# critique

一个美观的终端 UI，用于审查 git diff，支持语法高亮、分屏视图和单词级 diff。

![Diff Viewer Demo](screenshot.png)

## 安装

> **注意：** critique 需要 [Bun](https://bun.sh) - 不支持 Node.js。

```bash
# 使用 bunx 直接运行（无需安装）
bunx critique

# 或全局安装
bun install -g critique
```

## 使用方法

### 查看 Git Diff

```bash
# 查看未暂存的更改（包含未跟踪文件）
critique

# 查看已暂存的更改
critique --staged

# 查看自某个 ref 以来的更改（类似 git diff）
critique HEAD~1         # 显示最近 1 次提交（自 HEAD~1 以来的更改）
critique HEAD~3         # 显示最近 3 次提交
critique main           # 显示自 main 以来的更改（你的分支的新增内容）

# 仅查看特定提交（该提交引入的内容）
critique --commit HEAD~1
critique --commit abc1234

# 比较两个 ref（PR 风格，显示 head 自 base 分叉后新增的内容）
critique HEAD~3 HEAD    # 显示从 3 次提交前到现在所有更改

# 比较两个分支（PR 风格）
critique main feature-branch    # feature-branch 相对于 main 的新增内容
critique main HEAD              # 当前分支相对于 main 的新增内容

# 监视模式 - 文件更改时自动刷新
critique --watch

# 按 glob 模式过滤文件（可多次使用）
critique --filter "src/**/*.ts"
```

### 键盘快捷键

| 快捷键 | 说明 |
|--------|------|
| `j` / `↓` | 向下滚动 |
| `k` / `↑` | 向上滚动 |
| `h` / `←` | 切换到左侧（旧版本） |
| `l` / `→` | 切换到右侧（新版本） |
| `J` | 下一个文件 |
| `K` | 上一个文件 |
| `g` | 跳转到顶部 |
| `G` | 跳转到底部 |
| `d` | 向下翻半页 |
| `u` | 向上翻半页 |
| `s` | 切换分屏/统一视图 |
| `w` | 切换单词级 diff |
| `f` | 切换文件树 |
| `q` | 退出 |
| `?` | 显示帮助 |

## 功能特性

- 🎨 **语法高亮** — 支持 100+ 种语言
- 📊 **分屏视图** — 并排比较旧版本和新版本
- 🔤 **单词级 diff** — 高亮显示行内具体更改
- 📁 **文件树** — 侧边栏显示更改的文件列表
- 🔄 **监视模式** — 文件更改时自动刷新
- 🎯 **智能过滤** — 按 glob 模式过滤文件
- 💡 **简洁设计** — 最小化界面，专注于代码审查

## 配置

创建 `~/.config/critique/config.toml`：

```toml
[theme]
# 自定义颜色
added = "#a8ff60"
removed = "#ff6b6b"
```

## 为什么使用 critique？

传统的 `git diff` 输出难以阅读。IDE 的 diff 视图太重。critique 提供了一个轻量级的终端替代方案：

- **快速启动** — 无需等待 IDE 加载
- **键盘驱动** — 完全可通过键盘操作
- **美观** — 精心设计的配色和布局
- **专注** — 没有多余的 UI 干扰

## 开发

```bash
git clone https://github.com/remorses/critique.git
cd critique
bun install
bun run dev
```

## 许可证

MIT

# 24+1 · Broadcast Timecode Calculator

纯 HTML / CSS / JavaScript 时间码计算器。**无需构建、无需后端、无运行时依赖。**
四个功能按 Reformat / Round / Duration / Calculate 排列，每次刷新默认 Reformat。

## 部署到 GitHub Pages

1. 解压本 ZIP，把**解压后的全部文件和目录**上传到 GitHub 仓库根目录。根目录应直接看到 `index.html`，不要再套一层目录。
2. 仓库 **Settings → Pages → Build and deployment → Source → Deploy from a branch**。
3. 选择存放文件的分支（通常 `main`）与 **/(root)**，点击 Save。
4. 等待部署完成，打开 Pages 提供的 HTTPS 地址。项目站点的 `/repository-name/` 子路径受支持。

步骤依据：[GitHub 官方发布源配置文档](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。本交付未创建仓库或执行线上发布。

## 本地使用与测试

直接打开 `index.html` 可以计算；剪贴板需要浏览器允许的安全上下文，建议使用 HTTPS 或 localhost。
若安装了 Python，可在解压目录运行以下命令提供**开发预览用**静态服务（不是应用后端）：

```sh
python3 -m http.server 8000
```

打开 `http://localhost:8000/`。部署运行时不需要 Python 或 Node.js。

核心测试（Node.js 18+，无需安装依赖）：

```sh
node --test tests/timecode.test.js
```

结构、对比度与 HTTP 子目录检查（Python 3，标准库）：

```sh
python3 tests/static.test.py --serve
```

可选浏览器验收（仅测试工具需要 Playwright 与 Chromium；不会成为网站依赖）：

```sh
npm install --no-save playwright
npx playwright install chromium
# 保持上述 8000 端口的静态服务运行；macOS / Linux:
BASE_URL=http://localhost:8000/ node tests/browser.test.cjs
# Windows PowerShell:
# $env:BASE_URL='http://localhost:8000/'; node tests/browser.test.cjs
```

浏览器脚本涵盖复制成功/失败、键盘、设置恢复、多行粘贴、错误定位、四种宽度和缩放等效布局；成功后保存测试记录和截图到 `docs/`。实际浏览器缩放及真实输入法仍应按验收清单人工检查。

**已验证：114 项核心测试通过；静态结构与对比度检查通过。未验证：完整浏览器验收、响应式截图和实际 200% 缩放。** 详情见 `docs/VERIFICATION.md`。

## 输入规则与操作

- 仅支持 24 / 25 / 30 / 50 / 60 fps，整数帧率 NDF。默认 25 fps；不支持 DF、小数帧率或跨帧率转换。
- 单项：秒、分:秒、时:分:秒、时:分:秒:帧、**分.秒.帧**。例如 `04:31:00` 是 4 小时 31 分；`04.31.00` 是 4 分 31 秒。帧超范围报错，不自动进位。
- Round 先偏移再按累计时间对齐；Nearest 平分时取较大值；None 忽略禁用的 Interval。
- Duration 默认不含 End 帧，可通过 Include end frame 将结束帧计入结果。End 必须不早于 Start。
- Calculate / Expression 仅允许加减，可有负中间值及负结果。Sum list 每个非空行只接受一个无符号时间值，任一错误阻断结果。
- 无帧显示只是隐藏帧位，**不舍入、不丢失内部精度**；`mm:ss` 使用累计分钟。小时不在 24 小时回绕。
- 单行输入按 Enter 提交；列表 Enter 换行，Ctrl+Enter / ⌘+Enter 提交。标签支持 Left / Right / Home / End。
- Reformat 与 Round 输入时即时更新结果，不显示 Calculate 按钮。复制仅在点击 Copy / Copy all 时发生，并且只复制当前格式的结果。
- Reformat 支持单项或批量粘贴。每个物理行提取开头的第一个时间码，忽略描述文字、空行与 Markdown 表格分隔行；任一无效时间码会按行号报错并阻断全部输出。
- 偏好保存在当前浏览器 localStorage。输入、结果、当前标签与 Calculate 方式不跨刷新保存。

## 文件

- `index.html`、`styles.css`、`app.js`：界面、布局与浏览器交互。
- `timecode.js`：不依赖 DOM 的整数帧纯函数，使用 BigInt 做精确范围校验，公开结果仍为安全整数 Number。
- `assets/`：从用户原图提取的固定场记板、云朵，以及简单 SVG favicon；说明见 `assets/README.md`。
- `tests/`：核心、静态及可选浏览器测试。
- `docs/`：真实执行结果、限制、手工验收清单。

所有网站资源使用相对路径，无 CDN、远程字体、统计 SDK、网络计算请求或分析服务。采用系统无衬线与系统等宽字体，无需额外字体文件；页面为英文。支持 BigInt 的现代浏览器。

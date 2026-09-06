# Quill

一个极简静态博客系统，用 Node.js 构建。零框架依赖，构建产物为纯静态文件，可部署到任意静态托管。

## 目录结构

```
source/posts/<文章目录>/
    post.md            # front matter + Markdown 正文（统一命名）
    assets/            # 可选：正文引用的本地图片等，原样复制到输出
source/_data/
    friends.yml        # 友链数据（可选），生成 /friends/ 页面
    site.yml           # 站点配置：标题 / 副标题 / 图标 / banner
public/                # 构建产物（自动生成）
scripts/
    build.js           # 构建脚本：数据扫描 + 编排，页面渲染在 templates/
    cos.js             # 腾讯云 COS 上传模块（可选）
    new.js             # 创建新文章
    serve.js           # 本地预览服务器（零依赖）
    style.css          # 全站样式源文件，构建时输出到 public/style.css
    main.js            # 全站脚本：复制按钮 / 移动端菜单 / 顶栏收缩 / banner 视差
    templates/         # 页面渲染模板（JS 模板字符串）
        layout.js      # 站点信息 / 导航 / Hero 横幅 / HTML 外壳 / 转义
        post.js        # 单篇文章页
        post-list.js   # 文章卡片列表（首页 / 分类 / 标签 共用）
        archives.js    # 归档页（按年份分组）
        terms.js       # 分类 / 标签总览页
        friends.js     # 友链页
        pager.js       # 分页工具（PER_PAGE = 8）
```

## 生成的页面

| 页面 | URL | 说明 |
| ---- | --- | ---- |
| 首页 | `/`、`/page/2/` … | 文章卡片列表（按日期倒序，分页，每页 8 篇） |
| 文章 | `/posts/<目录名>/` | 单篇文章 |
| 归档 | `/archives/` | 按年份分组列出全部文章 |
| 分类 | `/categories/` | 分类总览，每个分类一个列表页 |
| 标签 | `/tags/` | 标签云（字号随文章数），每个标签一个列表页 |
| 友链 | `/friends/` | 读取 `source/_data/friends.yml` 渲染 |

## 文章格式

每篇文章的 `post.md` 开头带 YAML front matter：

```yaml
---
title: 文章标题
date: 2024-12-30 09:20:10
index_img: https://zuoguan-piclib-1257172707.cos.ap-guangzhou.myqcloud.com/assets/16.jpg
tags: [内存修改, CSharp]
categories: 编程
---
正文 Markdown...
```

- `tags` / `categories` 可留空
- `index_img` 可留空：构建时自动从图库 `assets/{{i}}.jpg` 分配**最小的空闲编号**并回写源文件；删除文章后编号自动复用，不冲突、不跳号
- `index_img` 同时用作列表页的**文章卡片封面**（自动追加 `?imageMogr2/thumbnail/420x192>` 缩略）与**文章页 Hero 横幅背景**（追加 `?imageMogr2/thumbnail/1600x900>`）

正文支持：

- **代码块**：```` ```lang ```` 围栏用 PrismJS 高亮，呈现为 macOS 风格窗口（红黄绿圆点标题栏）+ Atom One Light 配色，带语言标签、行号与复制按钮；行号固定在左侧，复制时不会带入。` ```c# ` 自动映射 C# 语法，无对应语法则按纯文本显示
- **数学公式**：`$...$` / `$$...$$` 构建期用 MathJax 渲染成**内联 SVG**（无需任何 CSS / 字体文件），```` ```math ```` 围栏也可写公式

## 站点配置（source/_data/site.yml）

文件缺失或字段未填时使用内置默认值：

```yaml
title: Quill                       # 站点标题（必填）
subtitle: 一个用 Markdown 写的极简博客  # 副标题（可选，留空则不显示）
favicon: /favicon.ico             # 站点图标（可选，填写后 <head> 输出 <link rel="icon">）
banner: https://.../banner.jpg    # 站点 Hero 横幅背景图（可选）
```

- `subtitle` 展示在导航栏与首页横幅中
- `banner` 填图后各页导航栏下方显示大图横幅（桌面端为整页固定背景 + 视差，移动端为随页面滚动并带视差的横幅）；文章页横幅自动用文章自己的 `index_img`；留空则所有页面不显示横幅

## 友链格式（source/_data/friends.yml）

```yaml
- name: 站点名       # 必填
  url: https://...   # 必填
  avatar: https://.../icon.png   # 可选，不填则显示首字符
  desc: 一句话简介    # 可选
```

## COS 图片上传（可选）

把文章 `assets/` 里的本地图片上传到腾讯云对象存储，构建出的 HTML 自动把 `./assets/xxx` 替换为 COS URL：

1. 复制 `cos.config.example.json` 为 `cos.config.json`（已 gitignore，密钥不会进版本库）
2. 填写并开启：

```json
{
  "enabled": true,
  "secretId": "SecretId",
  "secretKey": "SecretKey",
  "bucket": "bucket",
  "region": "region",
  "prefix": "",
  "skipExisting": true
}
```

- 上传路径为 `<prefix>/<文章slug>/assets/<文件>`，不与图库 `assets/` 编号图冲突
- `skipExisting: true` 时重复构建跳过已存在文件，加速增量构建
- 未启用/未配置时构建照常进行，图片使用本地相对路径；单文件上传失败不阻塞构建（打印 `[COS!]` 警告）

正文中的相对图片路径（`./assets/xxx.jpg`）会随 `assets/` 目录一起复制到输出，保持引用有效。

## 使用

```bash
npm install        # 首次安装依赖（含可选 qrcode-terminal）
npm run new        # 创建新文章（交互式输入标题，可加参数直接指定）
npm run build      # 构建静态站点到 public/（清理时保留 public/images/）
npm run serve      # 本地预览，默认开启局域网访问（打印地址 + 二维码）
npm run serve:local  # 仅本机访问（不暴露局域网）
npm run shot       # 单独生成 siteshot 截图（构建结束时会自动执行）
```

**局域网真机预览**：`npm run serve` 默认绑定 `0.0.0.0`，启动时自动打印局域网地址并在终端生成二维码，手机与电脑连同一 Wi-Fi 后扫码即可打开；如需关闭局域网暴露，用 `npm run serve:local` 或 `$env:HOST='127.0.0.1'; npm run serve`。

### 自动生成 siteshot

构建完成后自动用系统自带的 **Edge / Chrome 无头模式**截取首页当前可见区域（等同 DevTools「Capture screenshot」），输出 `public/images/siteshot.png` 并同步转一份 JPG（白底、质量 95）；若 COS 已启用，两种格式都会覆盖上传到图床。

- 依赖 `puppeteer-core`，不下载浏览器；找不到浏览器时可用 `$env:SHOT_BROWSER="C:\...\msedge.exe"` 指定
- 截图失败只打印警告，**不影响构建结果**
- 图床上传后的地址如 `https://<bucket>.cos.<region>.myqcloud.com/assets/siteshot.png`

### 创建新文章

`npm run new` 会在 `source/posts/<标题>/post.md` 创建文件，之后打开填写 `tags` / `categories` 与正文即可：

```yaml
---
title: 文章标题
date: 2026-01-01 12:00:00
tags: 
categories: 
---
```

`index_img` 不用填写，构建时自动分配空闲编号并回写。

## 说明与待定项

- **md 命名**：构建时按「目录」扫描，取目录内第一个 `.md` 文件。无论以后定成「按标题命名」还是「统一 post.md」都能工作，无需改代码。
- slug 目前即目录名；如需 URL 化（拼音/英文 slug）可后续在 `build.js` 中增加映射。
- 未实现：RSS、完整主题配置（标题/副标题/图标/banner 已可通过 `source/_data/site.yml` 配置）。
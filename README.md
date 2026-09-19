# MagnetSearch 磁力搜索

聚合 多个磁力资源搜索源，基于 Cloudflare Pages 免费部署，前端单页无框架。

## 功能

- 🔍 **多源聚合**：TPB、RARBG、EZTV等
- ⚡ **切源秒出**：多源并发，单个源失败/超时不影响整体
- 🎨 **书院黄主题**：米白纸色 + 暖棕配色，深色/浅色自适应
- 📥 **一键下载**：磁力链接直接调系统默认下载软件
- ⚙️ **qBittorrent 推送**：支持配置 qBittorrent WebUI 地址、账号、密码、保存路径、分类
- 🔄 **域名自动更新**：GitHub Actions 定时检测各源可用性，自动写入最新域名

## 部署

### 前置要求

- GitHub 账号
- Cloudflare 账号（免费额度足够）

### 步骤

1. Fork 本仓库到自己的 GitHub
2. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → Create → Pages → Connect to Git
3. 选择你 fork 的仓库，构建命令留空，输出目录填 `/`
4. 点击 Deploy，等 1-2 分钟即可访问

## 域名自动更新

仓库自带 `.github/workflows/check-domains.yml`，每天定时跑 `check_domains.py`：

- 自动从各源发布页抓取最新可用域名
- 写入 `domains.json` 并自动 commit 回仓库
- Cloudflare Pages 检测到仓库更新后自动重新部署

BtFox 和种子吧的域名在 `domains.json` 里手动维护，定时任务会自动保留。

## 目录结构

```
├── functions/
│   └── api/
│       ├── search.js          # 搜索聚合后端（Pages Function）
│       └── douban-weekly.js   # 豆瓣每周热门
│   └── proxy/
│       └── yuhuage.js         # 雨花阁代理
├── index.html                 # 前端单页
├── domains.json               # 各源当前可用域名
├── check_domains.py           # 域名自动检测脚本
└── .github/workflows/         # GitHub Actions
```

## API

```
GET /api/search?q=关键词&page=1&sort=time&sources=btfox,zhongziba
```

参数：
- `q`：搜索关键词（必填）
- `page`：页码，默认 1
- `sort`：排序方式 `time` / `hits` / `length` / `relevance`
- `sources`：逗号分隔的源 ID，默认全部

## 说明

- 本站仅做磁力索引聚合，不存储任何资源文件
- 磁力链接由爬虫自动采集自 DHT 网络
- 如发现侵权内容，请联系对应源站举报

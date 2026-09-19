<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>磁力搜索 · 本地版</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ctext y='26' font-size='26'%3E%F0%9F%A7%B2%3C/text%3E%3C/svg%3E">
<style>
  /* ---------- tokens ---------- */
  /* ---------- 淡雅书院风 ---------- */
  :root {
    --bg: #f7f3ea;            /* 米白纸色 */
    --panel: #fdfaf3;         /* 卡片纸色 */
    --panel-2: #f2ecdf;       /* 稍深的纸色 */
    --line: #e0d7c4;          /* 淡棕边框 */
    --ink: #3a3226;           /* 墨色主文字 */
    --muted: #6b6152;         /* 次要文字 */
    --faint: #9b9080;         /* 淡墨辅助 */
    --seed: #5b8a5b;          /* 活种子 墨绿 */
    --weak: #b07d17;          /* 弱种子 棕黄 */
    --dead: #b04a3a;          /* 死种子 赭红 */
    --accent: #8a6a4a;        /* 暖棕主色 */
    --accent-hover: #6f5238;
    --accent-dim: #efe6d6;    /* 浅棕底 */
    --sel: rgba(138,106,74,.13);
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--ink);
    font: 14px/1.45 -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .mono, .title-cell, .hash, #query, .swarm-num, .seed-num {
    font-family: ui-monospace, "SF Mono", "Cascadia Code", Consolas, "Courier New", monospace;
  }
  button { font: inherit; cursor: pointer; }
  a { color: var(--accent); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  /* ---------- layout ---------- */
  .wrap { max-width: 1180px; margin: 0 auto; padding: 20px 22px 40px; }

  .brand {
    display: flex; align-items: baseline; gap: 10px; margin-bottom: 18px; flex-wrap: wrap;
  }
  .brand h1 { font-size: 20px; margin: 0; font-weight: 650; letter-spacing: .2px; }
  .brand .sub { color: var(--muted); font-size: 13px; }
  .brand .sub .dot-sep { color: var(--faint); margin: 0 4px; }

  .searchbar {
    display: flex; gap: 10px; align-items: stretch; margin-bottom: 14px;
  }
  .searchbar input {
    flex: 1; min-width: 0;
    font-size: 15px; color: var(--ink);
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 11px 14px;
  }
  .searchbar input::placeholder { color: var(--faint); }
  .searchbar input:focus { border-color: var(--accent); outline: none; }
  .searchbar button {
    background: var(--accent); color: #fff; border: 0; border-radius: 8px;
    padding: 0 22px; font-size: 15px; font-weight: 600;
  }
  .searchbar button:hover { background: var(--accent-hover); }
  .searchbar button:disabled { opacity: .55; cursor: default; }
  .searchbar button.running { background: var(--accent-dim); }

  /* ---------- source chips ---------- */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 999px;
    padding: 5px 12px; color: var(--muted); font-size: 13px; user-select: none;
    cursor: pointer;
  }
  .chip[data-on] { color: var(--ink); border-color: var(--accent); background: var(--sel); }
  .chip .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .9; }
  .chip[data-on] .dot { color: var(--accent); }
  .chip .ctx-hint { font-size: 10.5px; opacity: .55; margin-left: 2px; }

  /* ---------- match mode ---------- */
  .matchrow {
    display: flex; gap: 18px; flex-wrap: wrap; align-items: baseline;
    margin-bottom: 14px; padding: 8px 14px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  }
  .match-opt { display: inline-flex; align-items: baseline; gap: 6px; font-size: 13.5px; color: var(--muted); cursor: pointer; user-select: none; }
  .match-opt input { accent-color: var(--accent); }
  .match-opt .sub { font-size: 12px; color: var(--faint); }
  .match-opt:has(input:checked) { color: var(--ink); }

  /* ---------- 热门搜索 ---------- */
  .hot-panel {
    margin-bottom: 14px; padding: 10px 14px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  }
  .hot-panel .label { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
  .hot-panel .tags { display: flex; flex-wrap: wrap; gap: 8px; }
  .hot-tag {
    display: inline-block; padding: 4px 11px; border: 1px solid var(--line); border-radius: 999px;
    background: var(--panel-2); color: var(--muted); font-size: 12.5px; cursor: pointer;
    user-select: none; text-decoration: none;
  }
  .hot-tag:hover { color: var(--ink); border-color: var(--accent); }

  /* ---------- toolbar: swarm bar + controls ---------- */
  .toolbar {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    margin-bottom: 14px; padding: 12px 14px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
  }
  .swarm { flex: 1 1 260px; min-width: 0; }
  .swarm-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  .swarm-bar { display: flex; gap: 3px; height: 24px; }
  .seg {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: 5px; color: #fff; font-size: 12px; font-weight: 700;
    min-width: 34px; cursor: pointer; padding: 0 8px;
    transition: filter .12s;
  }
  .seg[data-n="0"] { display: none; }
  .seg:hover { filter: brightness(1.12); }
  .seg[data-f="alive"] { background: var(--seed); }
  .seg[data-f="weak"]  { background: var(--weak); }
  .seg[data-f="dead"]  { background: var(--dead); }
  .seg.off { filter: grayscale(1) opacity(.45); }
  .seg-label { font-weight: 500; opacity: .9; }
  .seg-count { }

  .controls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .mini { font-size: 13px; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
  .mini input[type="number"] {
    width: 58px; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; font-size: 13px;
  }
  .count {
    flex: 1 0 100%; display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid var(--line);
    font-size: 13px; color: var(--muted);
  }
  .count b { color: var(--ink); font-weight: 650; }
  .result-stats { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .selection-count { padding: 4px 9px; border-radius: 5px; background: var(--panel-2); }
  .selection-count.has-selection { background: var(--sel); color: var(--accent); }
  .batch-actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .batch-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    min-height: 38px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 7px;
    background: var(--panel-2); color: var(--ink); font-size: 13px; font-weight: 600;
  }
  .batch-btn svg { width: 16px; height: 16px; flex: none; }
  .batch-btn:hover:not(:disabled) { border-color: var(--accent); background: var(--sel); }
  .batch-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .batch-btn.primary:hover:not(:disabled) { background: var(--accent-hover); border-color: var(--accent-hover); }
  .batch-btn:disabled { opacity: .45; cursor: not-allowed; }
  .batch-btn:focus-visible { outline-offset: 3px; }
  .qb-report {
    margin: 0 0 14px; padding: 14px; background: var(--panel); border: 1px solid var(--line);
    border-left: 4px solid var(--accent); border-radius: 8px; overflow-wrap: anywhere;
  }
  .qb-report[data-kind="bad"] { border-left-color: var(--dead); }
  .qb-report[data-kind="warning"] { border-left-color: var(--weak); }
  .qb-report[data-kind="ok"] { border-left-color: var(--seed); }
  .qb-report p { margin: 5px 0; color: var(--muted); }
  .qb-report summary { cursor: pointer; padding: 6px 0; color: var(--accent); }
  .qb-report ul { margin: 4px 0 0; padding-left: 22px; max-height: 260px; overflow: auto; }
  .qb-report li { padding: 5px 0; }
  @media (max-width: 640px) {
    .toolbar .controls { width: 100%; justify-content: space-between; }
    .batch-actions { width: 100%; }
    .batch-btn { flex: 1 1 auto; min-height: 42px; }
    .batch-btn.primary { flex-basis: 100%; }
  }

  /* ---------- table ---------- */
  .tblwrap {
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    overflow: auto; max-height: 72vh;
  }
  table { border-collapse: collapse; width: 100%; min-width: 900px; }
  thead th {
    position: sticky; top: 0; z-index: 2;
    background: var(--panel-2); text-align: left;
    font-size: 12px; font-weight: 600; color: var(--muted);
    padding: 9px 12px; border-bottom: 1px solid var(--line); white-space: nowrap;
    user-select: none;
  }
  thead th.sortable { cursor: pointer; }
  thead th.sortable:hover { color: var(--ink); }
  thead th .dir { color: var(--accent); }
  tbody td { padding: 7px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
  tbody tr:hover { background: var(--sel); }
  tbody tr.sel { background: var(--sel); }
  tbody tr:last-child td { border-bottom: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .seed-num { font-weight: 700; }
  .seed-num.s-alive { color: var(--seed); }
  .seed-num.s-weak  { color: var(--weak); }
  .seed-num.s-dead  { color: var(--dead); }
  .seed-num.s-unknown { color: var(--faint); font-weight: 500; }
  .td-size { color: var(--muted); font-variant-numeric: tabular-nums; }
  .td-src { color: var(--muted); font-size: 12.5px; white-space: nowrap; }
  .title-cell {
    font-size: 13px; max-width: 460px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .title-cell a { color: var(--ink); text-decoration: none; cursor: pointer; }
  .title-cell a:hover { color: var(--accent); }
  .title-cell mark { background: var(--sel); color: var(--accent); border-radius: 2px; }

  .dlbtn {
    border: 1px solid var(--line); background: var(--panel-2); color: var(--muted);
    border-radius: 6px; padding: 2px 8px; font-size: 12px; cursor: pointer;
    font-family: inherit; line-height: 1.6;
  }
  .dlbtn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
  .dlbtn:disabled { opacity: .5; cursor: default; }
  .dlbtn.ok { border-color: var(--seed); color: var(--seed); }
  .dlbtn.bad { border-color: var(--dead); color: var(--dead); }
  .op { white-space: nowrap; }
  .op > * { margin-left: 6px; }

  .gear {
    border: 1px solid var(--line); background: var(--panel-2); color: var(--muted);
    border-radius: 8px; padding: 4px 10px; font-size: 12.5px; cursor: pointer;
    font-family: inherit;
  }
  .gear:hover { border-color: var(--accent); color: var(--accent); }
  .gear .qbdot { color: var(--faint); }
  .gear .qbdot.on { color: var(--seed); }

  dialog.settings {
    border: 1px solid var(--line); border-radius: 12px; padding: 0;
    background: var(--panel); color: var(--ink); max-width: 480px; width: calc(100% - 32px);
  }
  dialog.settings::backdrop { background: rgba(0,0,0,.5); }
  .settings h3 { margin: 0; padding: 14px 18px; border-bottom: 1px solid var(--line); font-size: 15px; }
  .settings .body { padding: 16px 18px; display: grid; gap: 12px; }
  .settings label { display: grid; gap: 4px; font-size: 12.5px; color: var(--muted); }
  .settings input {
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 7px;
    padding: 7px 10px; color: var(--ink); font: inherit; font-size: 13px;
  }
  .settings input:focus { border-color: var(--accent); outline: none; }
  .settings .hint { font-size: 11.5px; color: var(--faint); line-height: 1.55; }
  .settings .foot {
    display: flex; gap: 8px; align-items: center; justify-content: flex-end;
    padding: 12px 18px; border-top: 1px solid var(--line);
  }
  .settings .foot .msg { margin-right: auto; font-size: 12px; line-height: 1.5; }
  .settings .foot .msg.ok { color: var(--seed); }
  .settings .foot .msg.bad { color: var(--dead); }
  .settings .foot button {
    border-radius: 7px; padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer;
    border: 1px solid var(--line); background: var(--panel-2); color: var(--ink);
  }
  .settings .foot button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .title-cell .hash { color: var(--faint); font-size: 11px; margin-left: 8px; }
  .td-date { color: var(--faint); font-size: 12.5px; white-space: nowrap; }
  th.cb, td.cb { width: 34px; padding-right: 2px; }
  .cb input { accent-color: var(--accent); width: 15px; height: 15px; cursor: pointer; }
  td.op { width: 30px; text-align: center; }
  .copybtn {
    background: none; border: 0; color: var(--faint); font-size: 14px; opacity: 0;
    transition: opacity .1s;
  }
  tr:hover .copybtn, tr.sel .copybtn { opacity: 1; }
  .copybtn:hover { color: var(--accent); }

  /* ---------- progress ---------- */
  .progress {
    display: none; margin-bottom: 14px; padding: 12px 14px;
    background: var(--panel); border: 1px solid var(--line); border-radius: 10px;
    font-size: 13px;
  }
  .progress.show { display: block; }
  .progress .line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; line-height: 1.9; }
  .progress .spinner {
    width: 14px; height: 14px; border-radius: 50%;
    border: 2px solid var(--line); border-top-color: var(--accent);
    animation: spin .8s linear infinite; flex: none;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .progress .src-ok { color: var(--ink); }
  .progress .src-bad { color: var(--dead); }
  .progress .note { color: var(--muted); font-size: 12px; }

  /* ---------- empty / error ---------- */
  .empty { padding: 60px 20px; text-align: center; color: var(--muted); }
  .empty .big { font-size: 15px; margin-bottom: 6px; }
  .empty .hint { font-size: 13px; color: var(--faint); }
  .empty code { background: var(--panel-2); padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; }
  .empty .retry {
    margin-top: 12px; border: 1px solid var(--line); background: var(--panel-2); color: var(--ink);
    border-radius: 7px; padding: 6px 16px; font: inherit; font-size: 13px; cursor: pointer;
  }
  .empty .retry:hover { border-color: var(--accent); color: var(--accent); }

  /* ---------- toast ---------- */
  .toast {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: var(--ink); color: var(--bg); padding: 8px 16px; border-radius: 8px;
    font-size: 13px; opacity: 0; pointer-events: none; transition: opacity .15s;
    z-index: 10; white-space: nowrap;
  }
  .toast.show { opacity: 1; }

  .footnote { margin-top: 20px; font-size: 12px; color: var(--faint); text-align: center; }

  @media (prefers-reduced-motion: reduce) {
    .progress .spinner { animation: none; }
    * { transition: none !important; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="brand">
    <h1>磁力搜索</h1>
    <span class="sub" id="brandSub">本地版 · 15 个磁力站聚合 · 右键源标签可跳转源站</span>
  </div>

  <form class="searchbar" id="searchForm">
    <input id="query" type="search" placeholder="输入关键词，如 adn-666" autocomplete="off" spellcheck="false" autofocus>
    <button id="go" type="submit">搜索</button>
  </form>

  <div class="chips" id="chips"></div>

  <div class="matchrow">
    <label class="match-opt">
      <input type="radio" name="match" id="matchSmart" value="smart" checked>
      智能 <span class="sub">关键词出现在标题里即可</span>
    </label>
    <label class="match-opt">
      <input type="radio" name="match" id="matchExact" value="exact">
      完全 <span class="sub">从标题开头连续对上</span>
    </label>
  </div>

  <div class="hot-panel" id="hotPanel">
    <div class="label">热 门 搜 索 · 豆瓣一周口碑榜（点击即搜）</div>
    <div class="tags" id="hotTags">
      <a class="hot-tag" href="javascript:void(0)" data-q="杀死比尔：血色全传">杀死比尔：血色全传</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="欢迎来龙餐馆">欢迎来龙餐馆</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="我想留在你身边">我想留在你身边</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="奥德赛">奥德赛</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="空枪">空枪</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="坠落2：死点">坠落2：死点</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="燃烧吧！爸爸">燃烧吧！爸爸</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="肖申克的救赎">肖申克的救赎</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="蜘蛛侠：崭新之日">蜘蛛侠：崭新之日</a>
      <a class="hot-tag" href="javascript:void(0)" data-q="复仇者联盟4：终局之战">复仇者联盟4：终局之战</a>
    </div>
  </div>

  <div class="toolbar">
    <div class="swarm">
      <div class="swarm-label">种子存活 — 点一段只看这类（无种子数据的源不参与统计）</div>
      <div class="swarm-bar" id="swarmBar"></div>
    </div>
    <div class="controls">
      <label class="mini">至少 <input id="minSeeds" type="number" min="0" value="0"> 种子</label>
      <button class="gear" id="qbGear" title="配置 qBittorrent 连接">
        <span class="qbdot" id="qbDot">●</span> qBittorrent 设置
      </button>
      <button class="gear" id="srcUpdateBtn" title="从发布页拉取各源最新可用域名">更新搜索源</button>
    </div>
    <div class="count" id="count"></div>
  </div>

  <section class="qb-report" id="qbReport" hidden tabindex="-1" aria-label="qBittorrent 发送结果">
    <div id="qbReportStatus" role="status" aria-live="polite" aria-atomic="true"></div>
    <details id="qbReportDetails" hidden>
      <summary>查看逐条结果</summary>
      <ul id="qbReportItems"></ul>
    </details>
  </section>

  <dialog class="settings" id="qbDialog">
    <h3>qBittorrent 连接</h3>
    <div class="body">
      <label>
        WebUI 地址
        <input id="qbUrl" type="text" placeholder="http://127.0.0.1:8080" spellcheck="false">
      </label>
      <label>
        用户名 <span class="hint">开了「对本机跳过认证」就留空</span>
        <input id="qbUser" type="text" autocomplete="off" spellcheck="false">
      </label>
      <label>
        密码 <span class="hint"></span>
        <input id="qbPass" type="password" autocomplete="new-password">
      </label>
      <label>
        保存路径 <span class="hint">留空则用 qBittorrent 的默认下载目录</span>
        <input id="qbPath" type="text" placeholder="D:\Downloads" spellcheck="false">
      </label>
      <label>
        分类 <span class="hint">可选，对应 qBittorrent 里已建好的分类</span>
        <input id="qbCat" type="text" spellcheck="false">
      </label>
      <div class="hint">
        地址填 qBittorrent「选项 → Web UI」里的地址和端口。
        用户名密码保存在本机浏览器 localStorage，不会上传；发送走本机后端转发。
      </div>
    </div>
    <div class="foot">
      <span class="msg" id="qbMsg"></span>
      <button id="qbClose">关闭</button>
      <button class="primary" id="qbSave">保存</button>
    </div>
  </dialog>

  <div class="progress" id="progress"></div>

  <div class="tblwrap" id="tblwrap" hidden>
    <table>
      <thead id="thead"></thead>
      <tbody id="tbody"></tbody>
    </table>
  </div>

  <div class="empty" id="empty">
    <div class="big">还没有结果</div>
    <div class="hint">输入一个名字开始，例如 <code>adn-666</code>。标题须包含全部关键词。</div>
  </div>

  <div class="footnote">免责声明 · 本站仅聚合第三方搜索结果，不存储任何资源</div>
</div>

<div class="toast" id="toast"></div>

<script>
'use strict';

/* ================= 源定义（15 源，含 1337x） ================= */
const SOURCES = [
  { id: '0magnet',   label: 'ØMagnet' },
  { id: 'xiaocao',   label: '小草磁力' },
  { id: 'juniorter', label: 'Juniorter' },
  { id: 'cilibaike', label: '磁力百科' },
  { id: 'knaben',    label: 'Knaben' },
  { id: 'yuhuage',   label: '雨花阁' },
  { id: 'hufeng',    label: '虎风' },
  { id: 'cctv10',    label: 'U3C3' },
  { id: 'cilimao',   label: '磁力猫' },
  { id: 'ciliso',    label: '磁力搜' },
  { id: 'x1337x',    label: '1337x' },
  { id: 'taocili',   label: '淘磁力' },
  { id: 'tpb',       label: 'TPB' },
  { id: 'piratebay', label: '海盗湾HTML' },
  { id: 'therarbg',  label: 'RARBG' },
  { id: 'eztv',      label: 'EZTV' },
  { id: 'btfox',     label: 'BtFox' },
  { id: 'zhongziba', label: '种子吧' },
  { id: 'cilichi',   label: '磁力池' },
  { id: 'bitsearch', label: 'Bitsearch' },
];
const DEFAULT_SOURCES = ['0magnet'];
const API_BASE = '';

// 源站点主页（右键源标签跳转；后端返回 sourceSites 时优先用后端的）
const sourceSites = {
  '0magnet': 'https://0magnet.com',
  'juniorter': 'https://torrent.juniorter.in',
  'knaben': 'https://knaben.xyz',
  'cctv10': 'https://cctv10.net',
  'taocili': 'https://taocili9.shop',
  'tpb': 'https://thepiratebay.org',
  'piratebay': 'https://piratebayproxy.info',
  'therarbg': 'https://therarbg.com',
  'eztv': 'https://eztvx.to',
  'btfox': 'https://btfox.xyz',
  'zhongziba': 'https://seed8.org',
  'cilichi': 'https://cilichi.com',
  'bitsearch': 'https://bitsearch.to',
  'x1337x': 'https://1337x.to',
  'xiaocao': 'https://xc123.org',
  'cilibaike': 'https://cilibaike.net',
  'yuhuage': 'https://yuhuage.top',
  'hufeng': 'https://hufeng.io',
  'cilimao': 'https://cilimao.top',
  'ciliso': 'https://www.ciliso.com',
};

/* ================= qBittorrent（本地后端 /api/qb 转发） ================= */
const QB_STORAGE_KEY = 'qb_config';
const QB_DEFAULT = { url: 'https://127.0.0.1:8080', user: '', pass: '', path: '', cat: '' };
let qbConfig = { ...QB_DEFAULT };

function loadQbConfig() {
  try {
    const raw = localStorage.getItem(QB_STORAGE_KEY);
    if (raw) qbConfig = { ...QB_DEFAULT, ...JSON.parse(raw) };
  } catch (e) { /* 忽略 */ }
  $('#qbDot').classList.toggle('on', !!(qbConfig.url && qbConfig.user));
}
function saveQbConfig() {
  localStorage.setItem(QB_STORAGE_KEY, JSON.stringify(qbConfig));
  $('#qbDot').classList.toggle('on', !!(qbConfig.url && qbConfig.user));
}

/* ================= 状态 ================= */
const state = {
  running: false,
  rows: [],            // 表格行（已映射）
  order: [],           // 排序后 index
  selected: new Set(),
  sortKey: 'seeds',
  sortDir: -1,
  aliveFilter: null,
  minSeeds: 0,
  matchMode: 'smart',
  clientFilter: '',
};

const $ = (s) => document.querySelector(s);
const fmtSize = (b) => {
  if (!b) return '-';
  const u = ['B','KB','MB','GB','TB']; let v = b, i = 0;
  while (v >= 1024 && i < u.length-1) { v /= 1024; i++; }
  return (v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)) + ' ' + u[i];
};
const fmtDate = (d) => (d || '').slice(0, 10);
const rowId = (it) => it.hash || ('t:' + (it.title || '').toLowerCase());
const aliveClass = (s) => (s >= 5 ? 's-alive' : s >= 1 ? 's-weak' : 's-dead');
const aliveBucket = (s) => (s >= 5 ? 'alive' : s >= 1 ? 'weak' : 'dead');

/* ---------- 数据映射：后端 item → 表格行 ---------- */
function seedNum(it) {
  const raw = it && it.seeds;
  if (raw === undefined || raw === null || raw === '') return -1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : -1;
}
function itemKey(it) {
  const m = it && it.magnet && it.magnet.match(/btih:([a-zA-Z0-9]{32,40})/);
  return m ? ('h:' + m[1].toLowerCase()) : ('n:' + ((it && it.name) || ''));
}
function toRow(it) {
  const m = (it.magnet || '').match(/btih:([a-zA-Z0-9]{32,40})/i);
  return {
    title: it.name || '',
    magnet: it.magnet || '',
    hash: m ? m[1].toLowerCase() : '',
    seeders: seedNum(it),
    leechers: parseInt(it.peers, 10) || 0,
    size: it.size || '',
    date: it.date || '',
    source: it.source || '',
    detailUrl: it.detailUrl || '',
  };
}
function rowsFromItems(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k = itemKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(toRow(it));
  }
  return out;
}
function parseSizeBytes(str) {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  const m = String(str).trim().match(/^([\d.]+)\s*(B|KB|MB|GB|TB)$/i);
  if (!m) return 0;
  const u = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };
  return parseFloat(m[1]) * (u[m[2].toUpperCase()] || 1);
}

/* ---------- source chips ---------- */
const selectedSources = new Set(DEFAULT_SOURCES);
function buildChips() {
  $('#chips').replaceChildren();
  for (const s of SOURCES) {
    const el = document.createElement('label');
    el.className = 'chip';
    el.dataset.id = s.id;
    if (selectedSources.has(s.id)) el.dataset.on = '';
    el.innerHTML = '<span class="dot"></span>' + s.label;
    el.title = '左键切换勾选 · 右键跳转源站点';
    el.addEventListener('click', () => {
      if (selectedSources.has(s.id)) { selectedSources.delete(s.id); }
      else { selectedSources.add(s.id); }
      el.toggleAttribute('data-on');
      if (currentQuery) {
        const srcs = getSelectedSources();
        if (srcs.length === 0) showEmptySourceHint();
        else if (!tryInstantSwitch()) doSearch(currentQuery, 1);
      }
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const site = sourceSites[s.id];
      if (site) window.open(site, '_blank', 'noopener');
      else toast(s.label + '：暂无站点链接');
    });
    $('#chips').appendChild(el);
  }
}
function getSelectedSources() {
  return SOURCES.filter(s => selectedSources.has(s.id)).map(s => s.id);
}

/* ---------- swarm bar ---------- */
function buildSwarm() {
  const bar = $('#swarmBar');
  bar.replaceChildren();
  const buckets = { alive: 0, weak: 0, dead: 0 };
  for (const r of state.rows) {
    if (r.seeders < 0) continue; // 无种子数据不参与分桶
    buckets[aliveBucket(r.seeders)]++;
  }
  const label = { alive: '活', weak: '弱', dead: '死' };
  for (const key of ['alive', 'weak', 'dead']) {
    const seg = document.createElement('button');
    seg.className = 'seg';
    seg.dataset.f = key;
    seg.dataset.n = buckets[key];
    if (state.aliveFilter === key) seg.classList.add('off');
    seg.innerHTML = '<span class="seg-label">' + label[key] + '</span><span class="seg-count">' + buckets[key] + '</span>';
    seg.style.flex = buckets[key] || 0.0001;
    seg.title = label[key] + '：' + buckets[key] + ' 条，点一下只看这类';
    seg.addEventListener('click', () => {
      state.aliveFilter = state.aliveFilter === key ? null : key;
      buildSwarm();
      renderTable();
    });
    bar.appendChild(seg);
  }
  if (!state.rows.length) bar.innerHTML = '<span class="note" style="color:var(--faint);font-size:12px">—</span>';
}

/* ---------- table headers ---------- */
const HEADS = [
  { key: 'cb', label: '' },
  { key: 'seeds', label: '种子', sortable: true, num: true },
  { key: 'leech', label: '下载', num: true },
  { key: 'size', label: '大小', sortable: true, num: true },
  { key: 'src', label: '来源' },
  { key: 'title', label: '标题', sortable: true },
  { key: 'date', label: '发布', sortable: true },
  { key: 'op', label: '' },
];
function buildHead() {
  const tr = document.createElement('tr');
  for (const h of HEADS) {
    const th = document.createElement('th');
    if (h.key === 'cb') {
      th.className = 'cb';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'selectAll';
      cb.title = '全选当前显示的结果';
      cb.setAttribute('aria-label', '全选当前显示的结果');
      cb.addEventListener('change', () => {
        for (const i of state.order) {
          const id = rowId(state.rows[i]);
          cb.checked ? state.selected.add(id) : state.selected.delete(id);
        }
        renderTable();
      });
      th.appendChild(cb);
    }
    if (h.label) th.textContent = h.label;
    if (h.num) th.classList.add('num');
    if (h.sortable) {
      th.classList.add('sortable');
      th.dataset.key = h.key;
      if (state.sortKey === h.key) {
        const dir = document.createElement('span');
        dir.className = 'dir';
        dir.textContent = state.sortDir === -1 ? ' ↓' : ' ↑';
        th.appendChild(dir);
      }
      th.addEventListener('click', () => {
        if (state.sortKey === h.key) state.sortDir *= -1;
        else { state.sortKey = h.key; state.sortDir = -1; }
        buildHead();
        renderTable();
      });
    }
    tr.appendChild(th);
  }
  $('#thead').replaceChildren(tr);
  updateSelectAll();
}

function updateSelectAll() {
  const cb = $('#selectAll');
  if (!cb) return;
  const total = state.order.length;
  const selected = state.order.filter((i) => state.selected.has(rowId(state.rows[i]))).length;
  cb.checked = total > 0 && selected === total;
  cb.indeterminate = selected > 0 && selected < total;
  cb.disabled = total === 0;
}

/* ---------- filtering + sorting ---------- */
function matchTitle(r) {
  const q = currentQuery || '';
  if (!q) return true;
  const title = r.title.toLowerCase();
  if (state.matchMode === 'exact') {
    return title.startsWith(q.toLowerCase());
  }
  const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.every((t) => title.includes(t));
}
function applyView() {
  const tokens = state.clientFilter.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let idx = [];
  state.rows.forEach((r, i) => {
    if (r.seeders >= 0 && r.seeders < state.minSeeds) return;      // 无种子数据不误伤
    if (state.aliveFilter && r.seeders >= 0 && aliveBucket(r.seeders) !== state.aliveFilter) return;
    if (!matchTitle(r)) return;
    if (tokens.length) {
      const t = r.title.toLowerCase();
      if (!tokens.every((k) => t.includes(k))) return;
    }
    idx.push(i);
  });
  const dir = state.sortDir;
  const cmp = {
    seeds: (a, b) => a.seeders - b.seeders || b.leechers - a.leechers,
    size: (a, b) => parseSizeBytes(a.size) - parseSizeBytes(b.size),
    title: (a, b) => a.title.localeCompare(b.title, 'zh'),
    date: (a, b) => String(b.date || '').localeCompare(String(a.date || '')),
  }[state.sortKey] || ((a, b) => b.seeders - a.seeders);
  idx.sort((x, y) => dir * cmp(state.rows[x], state.rows[y]));
  state.order = idx;
}

/* ---------- render ---------- */
function renderTable() {
  applyView();
  const tbody = $('#tbody');
  tbody.replaceChildren();
  const q = currentQuery || '';
  for (const i of state.order) {
    const r = state.rows[i];
    const tr = document.createElement('tr');
    const id = rowId(r);
    if (state.selected.has(id)) tr.classList.add('sel');

    // checkbox
    const tdCb = document.createElement('td');
    tdCb.className = 'cb';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.selected.has(id);
    cb.addEventListener('change', () => {
      cb.checked ? state.selected.add(id) : state.selected.delete(id);
      tr.classList.toggle('sel', cb.checked);
      updateCount();
    });
    tdCb.appendChild(cb);
    tr.appendChild(tdCb);

    // seeds
    const tdSeeds = document.createElement('td');
    tdSeeds.className = 'num';
    const seedEl = document.createElement('span');
    if (r.seeders < 0) {
      seedEl.className = 'seed-num s-unknown';
      seedEl.textContent = '未知';
    } else {
      seedEl.className = 'seed-num ' + aliveClass(r.seeders);
      seedEl.textContent = r.seeders;
    }
    tdSeeds.appendChild(seedEl);
    tr.appendChild(tdSeeds);

    // leechers
    const tdLe = document.createElement('td');
    tdLe.className = 'num';
    tdLe.textContent = r.seeders < 0 ? '-' : (r.leechers || 0);
    tr.appendChild(tdLe);

    // size
    const tdSize = document.createElement('td');
    tdSize.className = 'num td-size';
    tdSize.textContent = r.size || '-';
    tr.appendChild(tdSize);

    // source
    const tdSrc = document.createElement('td');
    tdSrc.className = 'td-src';
    tdSrc.textContent = r.source || '-';
    if (r.source) tdSrc.title = '当前种子数取自: ' + r.source;
    tr.appendChild(tdSrc);

    // title (click = copy magnet)
    const tdTitle = document.createElement('td');
    tdTitle.className = 'title-cell';
    const a = document.createElement('a');
    a.innerHTML = highlightKeyword(r.title, q);
    a.title = '点击复制磁力';
    if (r.magnet) {
      a.addEventListener('click', async () => {
        await copyText(r.magnet);
        toast('已复制磁力');
      });
    } else if (r.detailUrl) {
      a.style.cursor = 'pointer';
      a.title = '点击获取磁力链接';
      a.addEventListener('click', async () => {
        if (a.dataset.loading) return;
        a.dataset.loading = '1';
        const orig = a.innerHTML;
        a.innerHTML = '<span style="opacity:.5">获取磁力中…</span>';
        try {
          const resp = await fetch('/api/magnet?url=' + encodeURIComponent(r.detailUrl));
          const data = await resp.json();
          if (data.magnet) {
            r.magnet = data.magnet;
            const m = r.magnet.match(/btih:([a-zA-Z0-9]{32,40})/i);
            if (m) r.hash = m[1].toLowerCase();
            a.innerHTML = orig;
            a.title = '点击复制磁力';
            a.onclick = async () => { await copyText(r.magnet); toast('已复制磁力'); };
            toast('已获取磁力链接');
          } else {
            a.innerHTML = orig;
            a.title = '获取失败';
            toast('获取磁力失败');
          }
        } catch (e) {
          a.innerHTML = orig;
          toast('网络错误');
        } finally {
          delete a.dataset.loading;
        }
      });
    } else {
      a.style.cursor = 'default';
      a.title = '没有磁力链接';
    }
    tdTitle.appendChild(a);
    if (r.hash) {
      const h = document.createElement('span');
      h.className = 'hash';
      h.textContent = r.hash.slice(0, 12);
      h.title = 'infohash: ' + r.hash;
      tdTitle.appendChild(h);
    }
    tr.appendChild(tdTitle);

    // date
    const tdDate = document.createElement('td');
    tdDate.className = 'td-date';
    tdDate.textContent = fmtDate(r.date);
    tr.appendChild(tdDate);

    // op: 推送到 qBittorrent + 原页面链接
    const tdOp = document.createElement('td');
    tdOp.className = 'op';
    if (r.magnet) {
      const dl = document.createElement('a');
      dl.className = 'dlbtn';
      dl.textContent = '下载';
      dl.href = r.magnet;
      dl.title = '用本机默认下载工具打开此磁力链接（如 qBittorrent / 迅雷 / 比特彗星）';
      dl.rel = 'noopener';
      tdOp.appendChild(dl);
    }
    if (r.detailUrl) {
      const d = document.createElement('a');
      d.textContent = '↗';
      d.title = '打开原页面';
      d.href = r.detailUrl;
      d.target = '_blank';
      d.rel = 'noopener';
      tdOp.appendChild(d);
    }
    tr.appendChild(tdOp);

    tbody.appendChild(tr);
  }
  updateCount();
}

/* ---------- 推送到 qBittorrent ---------- */
const qb = { sending: false, results: new Map() };

function qbResultLabel(item) {
  return item.ok === true ? '已添加' : (item.ok === false ? '发送失败' : '待确认');
}
function showQbReport(title, message, kind) {
  const report = $('#qbReport');
  report.hidden = false;
  report.dataset.kind = kind;
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('p');
  detail.textContent = message;
  $('#qbReportStatus').replaceChildren(heading, detail);
}
async function pushToQb(magnets, btn) {
  if (qb.sending) return;
  const list = (magnets || []).filter(Boolean);
  if (!list.length) return toast('没有可推送的磁力');
  if (!qbConfig.url || !qbConfig.user) { openQbDialog(); return; }
  const titles = new Map(state.rows.map((r) => [r.magnet, r.title]));
  qb.sending = true;
  renderTable();
  showQbReport('正在发送 ' + list.length + ' 条任务…', '正在连接 qBittorrent 并添加任务，请稍候。', 'pending');
  $('#qbReportDetails').hidden = true;
  $('#qbReportItems').replaceChildren();
  $('#qbReport').scrollIntoView({ block: 'nearest' });

  let ok = 0, bad = 0;
  try {
    for (const magnet of list) {
      let res;
      try {
        const r = await fetch(API_BASE + '/api/qb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: qbConfig.url, user: qbConfig.user, pass: qbConfig.pass, savepath: qbConfig.path || '', category: qbConfig.cat || '', magnet }),
        });
        const j = await r.json();
        res = { ok: !!(j && j.ok), message: (j && j.error) || '' };
      } catch (e) {
        res = { ok: false, message: e.message || '连接失败' };
      }
      qb.results.set(magnet, res);
      if (res.ok) ok++; else bad++;
      const li = document.createElement('li');
      li.textContent = qbResultLabel(res) + ' — ' + (titles.get(magnet) || '') + (res.message ? '：' + res.message : '');
      $('#qbReportItems').appendChild(li);
    }
    const summary = '新增 ' + ok + ' 条 · 失败 ' + bad + ' 条';
    showQbReport(summary, '以下为本次发送结果。请到 qBittorrent 里确认任务状态。', bad ? 'warning' : 'ok');
    $('#qbReportDetails').hidden = false;
    $('#qbReportDetails').open = true;
    toast(summary, 6000);
  } catch (e) {
    showQbReport('发送未完成', e.message, 'bad');
    toast('发送未完成：' + e.message, 6000);
  } finally {
    qb.sending = false;
    renderTable();
  }
}

function qbMsg(text, cls) {
  const el = $('#qbMsg');
  el.textContent = text || '';
  el.className = 'msg' + (cls ? ' ' + cls : '');
}
function openQbDialog() {
  $('#qbUrl').value = qbConfig.url || '';
  $('#qbUser').value = qbConfig.user || '';
  $('#qbPass').value = '';
  $('#qbPath').value = qbConfig.path || '';
  $('#qbCat').value = qbConfig.cat || '';
  qbMsg('');
  $('#qbDialog').showModal();
}
function wireQbDialog() {
  $('#qbGear').addEventListener('click', openQbDialog);
  $('#qbClose').addEventListener('click', () => $('#qbDialog').close());
  $('#qbSave').addEventListener('click', () => {
    const url = $('#qbUrl').value.trim().replace(/\/+$/, '');
    const user = $('#qbUser').value.trim();
    const pass = $('#qbPass').value;
    const path = $('#qbPath').value.trim();
    const cat = $('#qbCat').value.trim();
    if (!url) { qbMsg('请填写 WebUI 地址', 'bad'); return; }
    if (!user) { qbMsg('请填写用户名（或开启免认证后仍可留空）', 'bad'); return; }
    qbConfig = { url, user, pass, path, cat };
    saveQbConfig();
    qbMsg('已保存', 'ok');
    setTimeout(() => $('#qbDialog').close(), 500);
  });
}

function updateCount() {
  updateSelectAll();
  const sel = state.selected.size;
  const total = state.rows.filter((r) => r.magnet).length;
  const copyIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>';
  const sendIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/></svg>';
  $('#count').innerHTML =
    '<div class="result-stats"><span>显示 <b>' + state.order.length + '</b> / ' + state.rows.length +
    ' 条</span><span class="selection-count' + (sel ? ' has-selection' : '') + '">已选 <b>' + sel + '</b> 条</span></div>' +
    '<div class="batch-actions" role="group" aria-label="批量磁力操作">' +
    '<button type="button" class="batch-btn" id="copySel" title="复制已勾选结果的磁力链接" ' + (sel ? '' : 'disabled') + '>' + copyIcon + '复制选中磁力</button>' +
    '<button type="button" class="batch-btn" id="copyAll" title="复制全部搜索结果的磁力链接" ' + (total ? '' : 'disabled') + '>' + copyIcon + '复制全部（' + total + '）</button>' +
    '<button type="button" class="batch-btn primary" id="qbSel" title="将已勾选结果发送到 qBittorrent" ' + (sel ? '' : 'disabled') + '>' + sendIcon + '发送选中到 qBittorrent</button></div>';
  const qs = $('#qbSel');
  if (qs) qs.disabled = !sel || qb.sending;
  if (qs) {
    if (qb.sending) qs.textContent = '正在发送…';
    qs.addEventListener('click', () => {
      const mags = state.rows.filter((r) => state.selected.has(rowId(r)) && r.magnet).map((r) => r.magnet);
      pushToQb(mags, qs);
    });
  }
  const cs = $('#copySel'), ca = $('#copyAll');
  if (cs) cs.addEventListener('click', () => {
    const mags = state.rows.filter((r) => state.selected.has(rowId(r)) && r.magnet).map((r) => r.magnet);
    copyText(mags.join('\n')).then(() => toast('已复制 ' + mags.length + ' 条磁力'));
  });
  if (ca) ca.addEventListener('click', () => {
    const mags = state.rows.filter((r) => r.magnet).map((r) => r.magnet);
    copyText(mags.join('\n')).then(() => toast('已复制 ' + mags.length + ' 条磁力'));
  });
}

/* ---------- progress ---------- */
function showProgress(show) {
  $('#progress').classList.toggle('show', show);
  $('#go').classList.toggle('running', show);
  $('#go').disabled = show;
}
function addProgressLine(text, kind) {
  const p = $('#progress');
  const line = document.createElement('div');
  line.className = 'line';
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  const msg = document.createElement('span');
  msg.textContent = text;
  if (kind === 'bad') msg.className = 'src-bad';
  else if (kind === 'src') msg.className = 'src-ok';
  else msg.className = 'note';
  line.appendChild(spinner);
  line.appendChild(msg);
  p.appendChild(line);
  p.scrollTop = p.scrollHeight;
}

/* ---------- empty states ---------- */
function showEmpty() {
  $('#tblwrap').hidden = true;
  const empty = $('#empty');
  empty.hidden = false;
  empty.querySelector('.big').textContent = '没有找到匹配的结果';
  empty.querySelector('.hint').innerHTML = '试试更短的关键词，或换一批源再搜。';
}
function showEmptySourceHint() {
  $('#tblwrap').hidden = true;
  state.rows = [];
  state.order = [];
  state.selected = new Set();
  renderTable();
  buildSwarm();
  const empty = $('#empty');
  empty.hidden = false;
  empty.querySelector('.big').textContent = '🍃 请至少勾选一个源';
  empty.querySelector('.hint').textContent = '在上方勾选想搜索的源即可继续';
}
function showSearchError() {
  $('#tblwrap').hidden = true;
  const empty = $('#empty');
  empty.hidden = false;
  empty.querySelector('.big').textContent = '⚠️ 数据源暂时不可用';
  empty.querySelector('.hint').textContent = '请稍后重试，或换个关键词';
}

/* ================= 切源秒出：缓存 + 预取 + 缺失补齐 ================= */
const resultCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const cacheKeyFor = (q, sort) => `${q}||${sort}`;
let pendingSearch = null;
let prefetchingKey = null;
let realRefreshing = false;
let isLoading = false;

function filterBySources(results, sources) {
  if (!sources || sources.length === 0) return results;
  const set = new Set(sources);
  return results.filter((it) => set.has(it.source));
}

async function prefetchAllSources(query) {
  const ck = cacheKeyFor(query, currentSort);
  if (resultCache.has(ck)) return;
  if (prefetchingKey === ck) return;
  prefetchingKey = ck;
  try {
    const allSources = SOURCES.map((s) => s.id);
    const url = `${API_BASE}/api/search?q=${encodeURIComponent(query)}&page=1&sort=${currentSort}&sources=${encodeURIComponent(allSources.join(','))}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    resultCache.set(ck, { data, ts: Date.now() });
  } catch (e) { /* 预取失败静默 */ } finally {
    if (prefetchingKey === ck) prefetchingKey = null;
  }
}

function mergeIntoCache(query, data, sources) {
  const ck = cacheKeyFor(query, currentSort);
  const prev = resultCache.get(ck);
  if (!prev) return;
  const srcSet = new Set(sources);
  const others = prev.data.results.filter((it) => !srcSet.has(it.source));
  const merged = [...others, ...(data.results || [])];
  resultCache.set(ck, { data: { ...prev.data, results: merged, total: merged.length }, ts: Date.now() });
}

async function refreshFromRealIfNeeded(query) {
  if (isLoading || realRefreshing) return;
  const ck = cacheKeyFor(query, currentSort);
  const cached = resultCache.get(ck);
  if (!cached) return;
  const sources = getSelectedSources();
  if (sources.length === 0) return;
  const dbg = cached.data.debug || {};
  const filtered = filterBySources(cached.data.results, sources);
  const needReal = sources.some((src) => {
    const cnt = Number(dbg[`${src}Count`]) || 0;
    if (cnt <= 0) return false;
    return filtered.filter((it) => it.source === src).length < cnt;
  });
  if (!needReal) return;
  realRefreshing = true;
  const srcsSnapshot = sources.join(',');
  try {
    const url = `${API_BASE}/api/search?q=${encodeURIComponent(query)}&page=1&sort=${currentSort}&sources=${encodeURIComponent(sources.join(','))}`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    mergeIntoCache(query, data, sources);
    if (getSelectedSources().join(',') === srcsSnapshot) {
      renderCached(query);
    }
  } catch (e) { /* 修正失败静默 */ } finally {
    realRefreshing = false;
  }
}

// 把缓存结果（后端原始 item）映射为表格行并渲染
function renderCached(query) {
  const ck = cacheKeyFor(query, currentSort);
  const cached = resultCache.get(ck);
  if (!cached) return;
  const sources = getSelectedSources();
  const filtered = filterBySources(cached.data.results, sources);
  state.rows = rowsFromItems(filtered);
  state.selected = new Set();
  state.aliveFilter = null;
  $('#tblwrap').hidden = false;
  $('#empty').hidden = true;
  buildSwarm();
  buildHead();
  renderTable();
}

function tryInstantSearch(query) {
  if (!query) return false;
  const ck = cacheKeyFor(query, currentSort);
  const cached = resultCache.get(ck);
  if (!cached || Date.now() - cached.ts >= CACHE_TTL) return false;
  const sources = getSelectedSources();
  if (sources.length === 0) return false;
  currentQuery = query;
  currentPage = 1;
  $('#hotPanel').style.display = 'none';
  renderCached(query);
  refreshFromRealIfNeeded(query);
  return true;
}
const tryInstantSwitch = tryInstantSearch;

/* ================= 流式搜索 ================= */
let __searchSeq = 0;
let currentQuery = '';
let currentPage = 1;
const currentSort = 'relevance';

async function doSearch(query, page = 1) {
  if (isLoading) {
    pendingSearch = { query, page };
    return;
  }
  const sources = getSelectedSources();
  if (sources.length === 0) { showEmptySourceHint(); return; }

  const mySeq = ++__searchSeq;
  const stale = () => mySeq !== __searchSeq;

  if (page === 1 && tryInstantSearch(query)) return;

  isLoading = true;
  currentQuery = query;
  currentPage = page;
  $('#hotPanel').style.display = 'none';

  // 重置表格/进度
  state.rows = [];
  state.selected = new Set();
  state.aliveFilter = null;
  $('#tblwrap').hidden = true;
  $('#empty').hidden = true;
  $('#qbReport').hidden = true;
  showProgress(true);
  $('#progress').replaceChildren();
  addProgressLine('搜索 ' + query + ' · ' + sources.length + ' 个源…');

  const seen = new Set();
  let doneSources = 0;
  const failedSources = [];
  let settled = false;

  const finishStream = (payload) => {
    if (settled) return;
    settled = true;
    if (state.rows.length === 0) {
      showProgress(false);
      if (failedSources.length >= sources.length) showSearchError();
      else showEmpty();
      return;
    }
    $('#tblwrap').hidden = false;
    $('#empty').hidden = true;
    buildSwarm();
    buildHead();
    renderTable();
    addProgressLine('✅ 全部来源已完成 · 共 ' + state.rows.length + ' 条' + (payload && payload.timing ? '（' + payload.timing + ' ms）' : ''), 'note');
  };

  try {
    const url = `${API_BASE}/api/search?q=${encodeURIComponent(query)}&page=${page}&sort=${currentSort}&sources=${encodeURIComponent(sources.join(','))}&stream=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);

    const ctype = res.headers.get('content-type') || '';
    if (!(ctype.includes('ndjson') && res.body && res.body.getReader)) {
      const data = await res.json();
      if (stale()) return;
      state.rows = rowsFromItems(data.results || []);
      settled = true;
      finishStream(data);
      if (page === 1) {
        mergeIntoCache(query, data, sources);
        prefetchAllSources(query);
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let rafId = 0;

    const flush = () => {
      rafId = 0;
      if (stale()) return;
      $('#tblwrap').hidden = false;
      $('#empty').hidden = true;
      renderTable();
    };
    const scheduleFlush = () => { if (!rafId) rafId = requestAnimationFrame(flush); };

    for (;;) {
      const chunk = await reader.read();
      if (stale()) { try { reader.cancel(); } catch (e) {} break; }
      if (chunk.done) break;
      buf += decoder.decode(chunk.value, { stream: true });
      let nlIdx;
      while ((nlIdx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nlIdx).trim();
        buf = buf.slice(nlIdx + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev.event === 'source') {
          doneSources += 1;
          if (ev.ok && Array.isArray(ev.items)) {
            for (const it of ev.items) {
              const k = itemKey(it);
              if (seen.has(k)) continue;
              seen.add(k);
              state.rows.push(toRow(it));
            }
            addProgressLine('✔ ' + (ev.name || '?') + '：' + (ev.items.length || 0) + ' 条（' + doneSources + '/' + sources.length + '）', 'src');
            scheduleFlush();
          } else if (!ev.ok) {
            failedSources.push({ name: ev.name, error: ev.error || '失败' });
            addProgressLine('✘ ' + (ev.name || '?') + '：' + (ev.error || '失败') + '（' + doneSources + '/' + sources.length + '）', 'bad');
          }
        } else if (ev.event === 'done') {
          finishStream(ev);
        }
      }
    }
    if (stale()) return;
    if (!settled) finishStream({ ok: true, total: state.rows.length });
    if (page === 1) prefetchAllSources(query);
  } catch (err) {
    if (stale() || err.name === 'AbortError') return;
    console.error('搜索失败:', err);
    if (state.rows.length === 0) showSearchError();
    else addProgressLine('连接中断，以上为已收到的结果', 'bad');
  } finally {
    if (mySeq === __searchSeq) {
      isLoading = false;
      showProgress(false);
      if (pendingSearch) {
        const p = pendingSearch;
        pendingSearch = null;
        doSearch(p.query, p.page);
      }
    }
  }
}

/* ---------- 工具函数 ---------- */
function highlightKeyword(text, keyword) {
  if (!keyword) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedKeyword = escapeRegExp(escapeHtml(keyword.trim()));
  const regex = new RegExp('(' + escapedKeyword + ')', 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
let toastTimer = 0;
function toast(text, ms) {
  const t = $('#toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1800);
}
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

/* ---------- 热门搜索：豆瓣一周口碑榜 ---------- */
(async function loadHotTags() {
  const hotTagsEl = $('#hotTags');
  if (!hotTagsEl) return;
  try {
    const res = await fetch(API_BASE + '/api/douban-weekly?limit=10', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const list = (json && json.data) || [];
    if (!list.length) return;
    hotTagsEl.replaceChildren();
    list.forEach(item => {
      const a = document.createElement('a');
      a.className = 'hot-tag';
      a.href = 'javascript:void(0)';
      a.dataset.q = item.title;
      a.textContent = item.title;
      a.addEventListener('click', () => {
        $('#query').value = item.title;
        doSearch(item.title, 1);
      });
      hotTagsEl.appendChild(a);
    });
  } catch (e) { /* 静默失败，保留兜底热词 */ }
})();

/* ---------- 搜索源在线更新 ---------- */
(async function srcUpdater() {
  const btn = $('#srcUpdateBtn');
  if (!btn) return;
  function fmtAt(meta) {
    return meta.updatedAt ? String(meta.updatedAt).replace('T', ' ').slice(5, 16) : '';
  }
  async function loadStatus() {
    try {
      const res = await fetch(API_BASE + '/api/domains', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const meta = json.meta;
        if (meta) {
          let txt = '本地版 · 15 源';
          if (meta.source === 'local') txt += ' · 搜索源已自动更新' + (fmtAt(meta) ? ' · ' + fmtAt(meta) : '');
          else txt += ' · 搜索源内置，共 ' + (meta.totalDomains || 0) + ' 个（联网后自动更新）';
          const sub = $('#brandSub');
          if (sub) sub.textContent = txt;
        }
      }
    } catch (e) { /* 忽略 */ }
  }
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '更新中…';
    toast('正在后台更新搜索源，约需 1 分钟…');
    try {
      const res = await fetch(API_BASE + '/api/domains/refresh', { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (json && json.meta) {
        const m = json.meta;
        if (json.ok && m && m.source === 'local') {
          toast('搜索源已更新：' + (m.totalDomains || 0) + ' 个域名');
        } else if (m) {
          toast('已检测，当前 ' + (m.totalDomains || 0) + ' 个域名；没更新到的源稍后自动重试');
        } else {
          toast('更新失败，已保留现有域名', true);
        }
        loadStatus();
      } else {
        toast('更新失败', true);
      }
    } catch (e) {
      toast('更新失败：' + (e.message || e), true);
    } finally {
      btn.disabled = false;
      btn.textContent = '更新搜索源';
    }
  });
  loadStatus();
})();

/* ---------- init ---------- */
loadQbConfig();
buildChips();
buildHead();
updateCount();
wireQbDialog();
$('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); const q = $('#query').value.trim(); if (q) doSearch(q, 1); });
$('#minSeeds').addEventListener('change', () => {
  state.minSeeds = parseInt($('#minSeeds').value || '0', 10) || 0;
  renderTable();
});
document.querySelectorAll('input[name="match"]').forEach((r) => {
  r.addEventListener('change', () => {
    state.matchMode = document.querySelector('input[name="match"]:checked').value;
    if (currentQuery) renderTable();
  });
});
</script>
</body>
</html>

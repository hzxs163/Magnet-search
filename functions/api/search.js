// Pages Functions - /api/search

// 域名配置实时读取在线配置（远程 > 本地缓存 > 内置 domains.json），更新后无需重启
import { getDomains } from './domain_config.js';
// 磁力百科/磁力搜：搜索时按当前 30 分钟时隙实时算子域名（FNV-1a+xorshift），永远最新
import { getCilisoDomains, getCilibaikeDomains } from './dyn_domains.js';

const JUNIORTER_API = 'https://torrent.juniorter.in/api/search-stream';
const JUNIORTER_PROVIDERS = [
  'yts', 'eztv', 'torrentclaw', 'piratebay', 'knaben', '1337x', 'limetorrents',
  'torrentfunk', 'torrentdownloads', 'torlock', 'yourbittorrent', 'magnetz',
  'bitsearch', 'solidtorrents', 'torrentscsv', 'therarbg', 'animetosho', 'nyaa',
  'mikan', 'tokyotosho', 'dmhy', 'acgrip', 'subsplease', 'rutor',
  'audiobookbay', 'academictorrents'
].join(',');

const KNABEN_API = 'https://api.knaben.org/v1';

let CCTV10_DEBUG = {};
let CILIMAO_DEBUG = {};

const ALL_SOURCE_IDS = ['0magnet','xiaocao','juniorter','cilibaike','knaben','yuhuage','hufeng','cctv10','cilimao','ciliso','x1337x','taocili','tpb','piratebay','therarbg','eztv','btfox','zhongziba','cilichi','bitsearch'];
// 单个“搜索源”的整体硬超时：到点就放弃该源，其它源与整页都不会被它拖住
const PER_SOURCE_TIMEOUT_MS = 12000;

function buildTasks(query, page, sort, waitUntil) {
  const tasks = [];
  const push = (name, promise, timeoutMs) => {
    // 防 unhandled rejection 崩进程：未选中/失败的任务 rejection 也必须被消费
    promise.catch(() => {});
    tasks.push({ name, promise, timeoutMs });
  };
  if (ALL_SOURCE_IDS.includes('0magnet'))    push('0magnet', fetchFrom0Magnet(query, sort, page, waitUntil));
  if (ALL_SOURCE_IDS.includes('xiaocao'))    push('xiaocao', fetchFromXiaocao(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('juniorter'))  push('juniorter', fetchFromJuniorter(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('cilibaike'))  push('cilibaike', fetchFromCilibaike(query, page, sort, waitUntil, 'cilibaike'));
  if (ALL_SOURCE_IDS.includes('knaben'))     push('knaben', fetchFromKnaben(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('yuhuage'))    push('yuhuage', fetchFromYuhuage(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('hufeng'))     push('hufeng', fetchFromHufeng(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('cctv10'))     push('cctv10', fetchFromCctv10(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('cilimao'))    push('cilimao', fetchFromCilimao(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('ciliso'))     push('ciliso', fetchFromCilibaike(query, page, sort, waitUntil, 'ciliso'));
  if (ALL_SOURCE_IDS.includes('x1337x'))     push('x1337x', fetchFromX1337x(query, page, sort, waitUntil), 25000); // 需翻页找精确匹配，放宽到 25s
  if (ALL_SOURCE_IDS.includes('taocili'))    push('taocili', fetchFromTaocili(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('tpb'))      push('tpb', fetchFromTpb(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('piratebay')) push('piratebay', fetchFromPiratebay(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('therarbg')) push('therarbg', fetchFromTherarbg(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('eztv'))     push('eztv', fetchFromEztvSmart(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('btfox'))    push('btfox', fetchFromBtfox(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('zhongziba')) push('zhongziba', fetchFromZhongziba(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('cilichi'))   push('cilichi', fetchFromCilichi(query, page, sort, waitUntil));
  if (ALL_SOURCE_IDS.includes('bitsearch')) push('bitsearch', fetchFromBitsearch(query, page, sort, waitUntil));
  return tasks;
}

// 只跑指定源（按用户勾选），保持与历史一致的源顺序
function selectTasks(allTasks, sources) {
  const want = new Set(sources);
  return ALL_SOURCE_IDS.filter((id) => want.has(id))
    .map((id) => allTasks.find((t) => t.name === id))
    .filter(Boolean);
}

function withSourceTimeout(promise, ms, label) {
  let timer = null;
  const failure = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 响应超时（>${ms}ms），已跳过该源`)), ms);
  });
  return Promise.race([promise, failure]).finally(() => { if (timer) clearTimeout(timer); });
}

function dedupItems(allItems) {
  const seen = new Set();
  const deduped = [];
  for (const item of allItems) {
    const hashMatch = item.magnet && item.magnet.match(/btih:([a-zA-Z0-9]{32,40})/);
    const key = hashMatch ? hashMatch[1].toLowerCase() : item.name;
    if (!seen.has(key)) { seen.add(key); deduped.push(item); }
  }
  return deduped;
}

/**
 * 并发跑所有源：
 *  - Promise.allSettled 语义：任一源失败/超时不影响其它源；
 *  - 每个源独立硬超时（PER_SOURCE_TIMEOUT_MS），慢源绝不拖整体；
 *  - 某源一结束就回调 onSource(ev)，供前端“谁先返回谁先显示”；
 * 返回最终去重后的聚合结果（供一次性 JSON 与流式 done 事件共用）。
 */
export async function runSearch({
  query, page = 1, sort = 'relevance', sources = ALL_SOURCE_IDS,
  waitUntil = null, onSource = null, timeoutMs = PER_SOURCE_TIMEOUT_MS,
}) {
  if (!query) throw new Error('Missing query');
  CCTV10_DEBUG = {};
  CILIMAO_DEBUG = {};
  const startTime = Date.now();

  const allTasks = buildTasks(query, page, sort, waitUntil);
  const tasks = selectTasks(allTasks, sources);

  const wrapped = tasks.map((t) => {
    const t0 = Date.now();
    const per = t.timeoutMs || timeoutMs;
    return withSourceTimeout(t.promise, per, t.name)
      .then((items) => {
        const value = Array.isArray(items) ? items : [];
        if (typeof onSource === 'function') {
          onSource({ event: 'source', name: t.name, ok: true, count: value.length, items: value, ms: Date.now() - t0 });
        }
        return { name: t.name, ok: true, value };
      })
      .catch((err) => {
        const reason = String((err && err.message) || err);
        console.error(`${t.name} failed:`, err);
        if (typeof onSource === 'function') {
          onSource({ event: 'source', name: t.name, ok: false, count: 0, items: [], error: reason, ms: Date.now() - t0 });
        }
        return { name: t.name, ok: false, reason };
      });
  });

  const outcomes = await Promise.all(wrapped);

  const allItems = [];
  const debug = {};
  for (const r of outcomes) {
    if (r.ok) {
      allItems.push(...r.value);
      debug[`${r.name}Status`] = 'fulfilled';
      debug[`${r.name}Count`] = r.value.length;
    } else {
      debug[`${r.name}Status`] = 'rejected';
      debug[`${r.name}Count`] = 0;
      debug[`${r.name}Error`] = r.reason;
    }
  }

  const deduped = dedupItems(allItems);
  return {
    results: deduped,
    total: deduped.length,
    totalBeforeDedup: allItems.length,
    timing: Date.now() - startTime,
    sources: tasks.map((t) => t.name),
    sourceOutcomes: outcomes,
    debug,
  };
}

// 兼容 Cloudflare Pages / 旧调用方：一次性聚合成 JSON（本地 server 默认走流式 /api/search?stream=1）
export async function onRequest(context) {
  const { request, waitUntil } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const sort = url.searchParams.get('sort') || 'relevance';
  const sources = (url.searchParams.get('sources') || ALL_SOURCE_IDS.join(','))
    .split(',').map((s) => s.trim()).filter(Boolean);

  if (!query) return jsonResponse({ error: 'Missing query parameter' }, 400);

  try {
    const out = await runSearch({ query, page, sort, sources, waitUntil });
    return jsonResponse({
      results: out.results,
      total: out.total,
      timing: out.timing,
      debug: {
        sources: out.sources,
        page,
        totalBeforeDedup: out.totalBeforeDedup,
        cctv10Raw: CCTV10_DEBUG,
        cilimaoRaw: CILIMAO_DEBUG,
        ...out.debug,
      },
    });
  } catch (err) {
    console.error('Search error:', err);
    return jsonResponse({ error: 'Search failed', detail: String(err), cctv10Raw: CCTV10_DEBUG, cilimaoRaw: CILIMAO_DEBUG }, 502);
  }
}

function simplifyMagnet(magnet) {
  if (!magnet) return '';
  const match = magnet.match(/xt=urn:btih:([a-zA-Z0-9]{32,40})/i);
  if (match) return `magnet:?xt=urn:btih:${match[1]}`;
  return magnet;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(2)} ${units[i]}`;
}

// ========== 域名配置（由 domain_config.js 统一管理，支持在线更新） ==========
function getDomainsConfig() {
  return getDomains();
}

// ========== Knaben ==========
async function fetchFromKnaben(query, page, sort, waitUntil) {
  const size = 100;
  const from = (page - 1) * size;

  let orderBy = 'seeders';
  switch (sort) {
    case 'length': orderBy = 'bytes'; break;
    case 'time':
    case 'newest': orderBy = 'date'; break;
    case 'requests': orderBy = 'peers'; break;
    default: orderBy = 'seeders'; break;
  }

  const body = {
    search_type: '100%',
    search_field: 'title',
    query: query,
    order_by: orderBy,
    order_direction: 'desc',
    from: from,
    size: size,
    hide_unsafe: true,
    hide_xxx: false,
  };

  const cacheKey = new Request(`https://knaben-cache.local/?q=${encodeURIComponent(query)}&page=${page}&sort=${sort}`, { method: 'GET' });
  const cache = caches.default;

  let response = await cache.match(cacheKey);
  if (!response) {
    response = await fetch(KNABEN_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Origin': 'https://knaben.xyz',
        'Referer': 'https://knaben.xyz/',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error(`Knaben HTTP ${response.status}`);

    const text = await response.clone().text();
    const cacheResponse = new Response(text, {
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
    });
    if (waitUntil) waitUntil(cache.put(cacheKey, cacheResponse));
    else await cache.put(cacheKey, cacheResponse);
  }

  return parseKnabenResults(await response.json());
}

function parseKnabenResults(data) {
  const items = [];
  for (const hit of (data.hits || [])) {
    if (!hit.title) continue;
    const magnet = hit.magnetUrl ? simplifyMagnet(hit.magnetUrl) : (hit.hash ? `magnet:?xt=urn:btih:${hit.hash}` : '');
    if (!magnet) continue;
    items.push({
      name: hit.title,
      size: formatBytes(hit.bytes),
      date: hit.date ? hit.date.slice(0, 10) : '',
      seeds: hit.seeders || 0,
      peers: hit.peers || 0,
      magnet: magnet,
      detailUrl: hit.details || '',
      source: 'knaben',
    });
  }
  return items;
}

// ========== 磁力百科 / 磁力搜（共用） ==========
async function fetchFromCilibaike(query, page, sort, waitUntil, sourceKey = 'cilibaike') {
  // 搜索那一刻按当前时隙实时计算（不读静态名单，不依赖 update_domains 的定时刷新）
  const domains = sourceKey === 'ciliso' ? getCilisoDomains() : getCilibaikeDomains();
  if (!domains || domains.length === 0) return [];

  let order = '0';
  switch (sort) {
    case 'length': order = '1'; break;
    case 'time':
    case 'newest': order = '2'; break;
    case 'requests': order = '3'; break;
    default: order = '0'; break;
  }

  const searchPath = `/search-${encodeURIComponent(query)}-0-${order}-${page}.html`;

  for (const domain of domains) {
    try {
      const html = await fetchWithCache(`${domain}${searchPath}?lang=zh_CN`, 900, waitUntil);
      if (!html.includes('resource-card')) continue;
      const items = parseCilibaikeResults(html, domain, sourceKey);
      if (items.length > 0) return items;
    } catch (err) {
      console.error(`${sourceKey} domain ${domain} failed:`, err);
    }
  }
  return [];
}

function parseCilibaikeResults(html, domain, sourceKey = 'cilibaike') {
  const items = [];
  const parts = html.split(/<article class="resource resource-card"[^>]*>/);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const titleMatch = block.match(/<h2><a[^>]+href="(\/hash\/([a-fA-F0-9]{40})\.html)"[^>]*>([\s\S]*?)<\/a><\/h2>/);
    if (!titleMatch) continue;
    const detailPath = titleMatch[1];
    const infoHash = titleMatch[2];
    let name = titleMatch[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    name = name.replace(/^【[^】]+】\s*/, '');
    if (!name) continue;

    const metaMatch = block.match(/<div class="meta resource-meta">([\s\S]*?)<\/div>/);
    let size = '', date = '';
    if (metaMatch) {
      const meta = metaMatch[1];
      const sizeMatch = meta.match(/大小：\s*<span>([^<]+)<\/span>/);
      const dateMatch = meta.match(/添加时间：\s*<span>([^<]+)<\/span>/);
      if (sizeMatch) size = sizeMatch[1].trim();
      if (dateMatch) date = dateMatch[1].trim();
    }

    items.push({
      name, size, date,
      magnet: `magnet:?xt=urn:btih:${infoHash}`,
      detailUrl: `${domain}${detailPath}`,
      source: sourceKey,
    });
  }
  return items;
}

// ========== 1337x（可直连镜像；CF 验证的域名会被自动跳过） ==========
const X1337X_CANDIDATES = ['https://1337x.la', 'https://1337x.st', 'https://www.1337x.tw', 'https://www.1337xx.to', 'https://1337xto.to'];
const X1337X_UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

// 1337x 不用 fetchWithCache：偶发 CF 验证页绝不能进缓存（缓存会把“验证页”固化 15 分钟导致源一直 0 结果）
// 注意：正常 1337x 页面也引用 challenge-platform 脚本，判定只认验证页特有字样，不能误伤真页
async function fetchX1337x(url) {
  const resp = await fetch(url, { headers: X1337X_UA, signal: AbortSignal.timeout(10000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  if (/<title>\s*(just a moment|attention required|请稍候)/i.test(text)) {
    throw new Error('CF验证');
  }
  return text;
}

function parseX1337xRows(html) {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => m[1]).filter((r) => /torrent\/\d+/.test(r));
  const items = [];
  for (const row of rows) {
    const link = [...row.matchAll(/<a[^>]*href="(\/torrent\/\d+\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
      .find((m) => m[2].replace(/<[^>]+>/g, '').trim());
    if (!link) continue;
    const name = link[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;
    items.push({
      name,
      detailPath: link[1],
      size: ((row.match(/coll-4 size[^>]*>([^<]+)/) || [])[1] || '').trim(),
      seeds: parseInt(((row.match(/coll-2 seeds[^>]*>([^<]+)/) || [])[1] || '0').replace(/[^\d]/g, '')) || 0,
      peers: parseInt(((row.match(/coll-3 leeches[^>]*>([^<]+)/) || [])[1] || '0').replace(/[^\d]/g, '')) || 0,
      date: ((row.match(/coll-date[^>]*>([^<]+)/) || [])[1] || '').trim(),
    });
  }
  return items;
}

// 详情页并发抓 magnet（限量并发，单条失败跳过，不拖整体）
async function attachX1337xMagnets(domain, rows, waitUntil) {
  const CONCURRENCY = 6;
  let idx = 0;
  const worker = async () => {
    while (idx < rows.length) {
      const i = idx++;
      const row = rows[i];
      try {
        const html = await fetchX1337x(`${domain}${row.detailPath}`);
        const m = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]+[^"'\s]*/);
        if (m) row.magnet = simplifyMagnet(m[0]);
      } catch (e) { /* 单条详情失败跳过 */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return rows;
}

async function fetchFromX1337x(query, page, sort, waitUntil) {
  const cfg = getDomains().x1337x || [];
  const domains = (cfg.length ? cfg : X1337X_CANDIDATES).slice(0, 4);
  const failures = [];
  // 1337x 是宽松 OR 匹配 + 20条/页：完整文件名（多点号）会让它退回热门列表、多词又噪音爆炸。
  // 实测 Tom.and.Jerry.2021.1080p.WEBRip.6CH.x264 → 发 "Tom Jerry 2021" 后第 3 页可命中。
  // 策略：发宽泛查询（剥技术词+停用词）→ 先抓第 1 页（单词搜索保持原速度）→
  // 本地核心词过滤，第 1 页无命中才补抓第 2/3 页（完整文件名等长查询场景）。
  const sendQ = broadQuery(query);
  const coreTokens = tokenizeQuery(sendQ);
  // 固定按需翻到第 3 页（与前端分页无关）：本地过滤需要多页覆盖，
  // 完整文件名等长查询时目标条常落在第 2/3 页；命中即停不浪费请求。
  const maxPages = 3;

  for (const domain of domains) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let allRows = [];
        let matched = [];
        // 第 1 页
        const html1 = await fetchX1337x(`${domain}/search/${encodeURIComponent(sendQ)}/1/`);
        const rows1 = parseX1337xRows(html1);
        if (rows1.length) {
          allRows.push(...rows1);
          matched.push(...rows1.filter((r) => titleMatchesTokens(r.name, coreTokens)));
        } else {
          failures.push(`${domain}=第1页无结果`);
        }
        // 第 1 页无命中才并行补抓剩余页
        if (!matched.length && maxPages >= 2 && allRows.length) {
          // allSettled：单页失败只跳过该页，不丢掉其它页已抓到的目标
          const settled = await Promise.allSettled(
            Array.from({ length: maxPages - 1 }, (_, i) =>
              fetchX1337x(`${domain}/search/${encodeURIComponent(sendQ)}/${i + 2}/`)
            )
          );
          settled.forEach((s, i) => {
            if (s.status === 'fulfilled') {
              const rows = parseX1337xRows(s.value);
              if (rows.length) {
                allRows.push(...rows);
                matched.push(...rows.filter((r) => titleMatchesTokens(r.name, coreTokens)));
              }
            } else {
              failures.push(`${domain}=第${i + 2}页失败`);
            }
          });
        }
        if (!allRows.length) break;
        // 一条都不匹配时退回全部（单核心词/中文查询等场景 1337x 本就给不出精确匹配）
        const candidates = matched.length ? matched : allRows;
        await attachX1337xMagnets(domain, candidates.slice(0, 15), waitUntil);
        const hits = candidates.filter((it) => it.magnet);
        if (hits.length) {
          return hits.map((it) => ({
            name: it.name,
            size: it.size,
            date: it.date,
            seeds: it.seeds,
            peers: it.peers,
            magnet: it.magnet,
            detailUrl: `${domain}${it.detailPath}`,
            source: 'x1337x',
          }));
        }
        failures.push(`${domain}=详情未取到magnet`);
        break;
      } catch (e) {
        if (attempt === 0) { continue; } // 重试一次（应对偶发 CF 验证）
        failures.push(`${domain}=${e.message}`);
      }
    }
  }
  console.error(`x1337x 所有候选失败: ${failures.join('; ')}`);
  return [];
}

// ========== 淘磁力（内部 JSON API + 详情页补 magnet） ==========
function b64FromUtf8(str) {
  // 中文等非 ASCII 关键词：btoa 直接对 UTF-16 会抛错，先转 UTF-8 字节再编码
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function fetchFromTaocili(query, page, sort, waitUntil) {
  const domains = getDomainsConfig().taocili || [];
  if (domains.length === 0) return [];

  const keyword = encodeURIComponent(b64FromUtf8(query));
  let sortParam = 'default';
  if (sort === 'time' || sort === 'newest') sortParam = 'atime';
  else if (sort === 'length') sortParam = 'size_desc';

  // 站点前端实际翻页参数是 start(偏移)/count(条数)，不是 page
  const start = Math.max(0, (Math.max(1, page || 1) - 1) * 20);

  for (const domain of domains) {
    try {
      const apiUrl = `${domain}/apis/search?keyword=${keyword}&base64=1&detail=1&start=${start}&count=20&type=all&sort=${sortParam}`;
      const text = await fetchWithCache(apiUrl, 1800, waitUntil);
      let data;
      try { data = JSON.parse(text); } catch (e) { throw new Error('JSON解析失败'); }
      if (!data || data.code !== 0 || !Array.isArray(data.items)) continue;
      const rows = data.items.filter((it) => it && it.name && it._id).slice(0, 20);
      if (rows.length === 0) continue;
      const items = rows.map(row => ({
        name: row.name,
        size: formatBytes(row.len),
        date: row.atime ? new Date(row.atime).toISOString().slice(0, 10) : '',
        magnet: '',
        detailUrl: `${domain}/magnet/${row._id}`,
        source: 'taocili',
      }));
      if (items.length > 0) return items;
    } catch (err) {
      console.error(`Taocili domain ${domain} failed:`, err);
    }
  }
  return [];
}

// 详情页并发抓 magnet（限量并发，单条失败跳过，不拖整体）
async function batchFetchTaociliMagnets(rows, domain, waitUntil) {
  const CONCURRENCY = 6;
  const results = [];
  let idx = 0;
  const worker = async () => {
    while (idx < rows.length) {
      const i = idx++;
      const row = rows[i];
      try {
        const detailUrl = `${domain}/magnet/${row._id}`;
        const html = await fetchWithCache(detailUrl, 3600, waitUntil);
        const m = html.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/);
        if (!m) continue;
        results.push({
          name: row.name,
          size: formatBytes(row.len),
          date: row.atime ? new Date(row.atime).toISOString().slice(0, 10) : '',
          magnet: simplifyMagnet(m[0]),
          detailUrl,
          source: 'taocili',
        });
      } catch (e) { /* 单条详情失败跳过 */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  return results;
}

// ========== BtFox ==========
// 列表页普通 HTML；关键词用无 padding base64；磁力在 /info/{id} 详情页 <input id="mag-link">
async function fetchFromBtfox(query, page, sort, waitUntil) {
  const domains = getDomainsConfig().btfox || ['https://btfox20.top'];
  if (domains.length === 0) return [];

  const wd = Buffer.from(query, 'utf-8').toString('base64').replace(/=+$/, '');
  let sortParam = 'time';
  if (sort === 'requests' || sort === 'hits') sortParam = 'hits';
  else if (sort === 'length') sortParam = 'length';
  else if (sort === 'relevance' || sort === 'rele') sortParam = 'rele';
  const pageNum = Math.max(1, page || 1);

  for (const domain of domains) {
    try {
      const listUrl = `${domain}/s?wd=${wd}&sort=${sortParam}&page=${pageNum}`;
      const html = await fetchWithCache(listUrl, 1800, waitUntil);
      const items = parseBtfoxList(html, domain);
      if (items.length === 0) continue;
      return items; // 磁力链接按需加载
    } catch (err) {
      console.error(`BtFox domain ${domain} failed:`, err);
    }
  }
  return [];
}

function parseBtfoxList(html, domain) {
  const items = [];
  const blocks = html.split(/<div class="item">/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const end = block.indexOf('<div class="box_border">');
    const seg = end > 0 ? block.slice(0, end) : block;
    const aMatch = seg.match(/<a[^>]+href="([^"]+)"[^>]*title="([^"]*)"/);
    if (!aMatch) continue;
    let href = aMatch[1].trim();
    if (!href.startsWith('http')) href = domain.replace(/\/+$/, '') + href;
    if (!href.includes('/info/')) continue;
    const title = (aMatch[2] || '').replace(/<[^>]+>/g, '').trim();
    if (!title) continue;

    const noteMatch = seg.match(/<div class="threadlist_note">([\s\S]*?)<\/div>/);
    let size = '', date = '';
    if (noteMatch) {
      const sizeM = noteMatch[1].match(/length[：:][\s\S]*?([\d.]+\s*(?:B|KB|MB|GB|TB))/i);
      if (sizeM) size = sizeM[1].replace(/\s+/g, ' ');
      const dateM = noteMatch[1].match(/date[：:][\s\S]*?(\d{4}-\d{2}-\d{2})/);
      if (dateM) date = dateM[1];
    }
    items.push({ name: title, size, date, detailUrl: href, source: 'btfox' });
  }
  return items;
}

async function batchFetchBtfoxMagnets(items, waitUntil) {
  const CONCURRENCY = 5;
  const results = [];
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      const item = items[i];
      try {
        const html = await fetchWithCache(item.detailUrl, 3600, waitUntil);
        const m = html.match(/<input[^>]+id="mag-link"[^>]+value="(magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40})"/)
          || html.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}/);
        if (m) {
          results.push({
            name: item.name,
            size: item.size,
            date: item.date,
            magnet: simplifyMagnet(m[1] || m[0]),
            detailUrl: item.detailUrl,
            source: 'btfox',
          });
        }
      } catch (e) { /* 单条详情失败跳过 */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

// ========== 种子吧 ==========
// 列表 <li class="media">；磁力在 /seed/{id} 详情页 <textarea id="magnetLink">
async function fetchFromZhongziba(query, page, sort, waitUntil) {
  const domains = getDomainsConfig().zhongziba || ['https://zzb10.vip'];
  if (domains.length === 0) return [];

  const wd = Buffer.from(query, 'utf-8').toString('base64').replace(/=+$/, '');
  let sortParam = 'rel';
  if (sort === 'time' || sort === 'newest') sortParam = 'time';
  else if (sort === 'requests' || sort === 'hits') sortParam = 'hits';
  else if (sort === 'length') sortParam = 'size';
  const pageNum = Math.max(1, page || 1);

  for (const domain of domains) {
    try {
      const listUrl = `${domain}/search?wd=${wd}&sort=${sortParam}&page=${pageNum}`;
      const html = await fetchWithCache(listUrl, 1800, waitUntil);
      const items = parseZhongzibaList(html, domain);
      if (items.length === 0) continue;
      return items; // 磁力链接按需加载
    } catch (err) {
      console.error(`Zhongziba domain ${domain} failed:`, err);
    }
  }
  return [];
}

function parseZhongzibaList(html, domain) {
  const items = [];
  const blocks = html.split(/<li class="media">/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const end = block.indexOf('</li>');
    const seg = end > 0 ? block.slice(0, end) : block;
    const aMatch = seg.match(/<a[^>]+href="([^"]+)"[^>]*title="([^"]*)"/);
    if (!aMatch) continue;
    let href = aMatch[1].trim();
    if (!href.startsWith('http')) href = domain.replace(/\/+$/, '') + href;
    if (!href.includes('/seed/')) continue;
    const title = (aMatch[2] || '').replace(/<[^>]+>/g, '').trim();
    if (!title) continue;

    let size = '', date = '';
    const dateM = seg.match(/日期[：:]\s*<span[^>]*>(\d{4}-\d{2}-\d{2})<\/span>/);
    if (dateM) date = dateM[1];
    const sizeM = seg.match(/大小[：:]\s*<span[^>]*>([\d.]+\s*(?:B|KB|MB|GB|TB))<\/span>/i);
    if (sizeM) size = sizeM[1].replace(/\s+/g, ' ');
    items.push({ name: title, size, date, detailUrl: href, source: 'zhongziba' });
  }
  return items;
}

async function batchFetchZhongzibaMagnets(items, waitUntil) {
  const CONCURRENCY = 5;
  const results = [];
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      const item = items[i];
      try {
        const html = await fetchWithCache(item.detailUrl, 3600, waitUntil);
        const m = html.match(/<textarea[^>]+id="magnetLink"[^>]*>\s*(magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40})/)
          || html.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}/);
        if (m) {
          results.push({
            name: item.name,
            size: item.size,
            date: item.date,
            magnet: simplifyMagnet(m[1] || m[0]),
            detailUrl: item.detailUrl,
            source: 'zhongziba',
          });
        }
      } catch (e) { /* 单条详情失败跳过 */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

// ========== 磁力池 ==========
async function fetchFromCilichi(query, page, sort, waitUntil) {
  const domains = getDomainsConfig().cilichi || ['https://www.cilichi.pro'];
  if (domains.length === 0) return [];
  const hex = Buffer.from(query, 'utf-8').toString('hex');
  let sortParam = 'id';
  if (sort === 'length') sortParam = 'length';
  else if (sort === 'requests' || sort === 'hits') sortParam = 'requests';
  else if (sort === 'relevance' || sort === 'rele') sortParam = '';
  const pageNum = Math.max(1, page || 1);
  for (const domain of domains) {
    try {
      const sortPart = `_${sortParam}`;
      const listUrl = `${domain}/cilichi/${hex}_${pageNum}${sortPart}.html`;
      const html = await fetchWithCache(listUrl, 1800, waitUntil);
      const items = parseCilichiList(html, domain);
      if (items.length === 0) continue;
      return items; // 磁力链接按需加载
    } catch (err) { console.error(`Cilichi domain ${domain} failed:`, err); }
  }
  return [];
}
function parseCilichiList(html, domain) {
  const items = [];
  const blocks = html.split(/<div class="card border-dashed border-2 mb-2">/);
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const end = block.indexOf('</div>\n</div>');
    const seg = end > 0 ? block.slice(0, end) : block;
    const aMatch = seg.match(/<a[^>]+href="([^"]*\/btcililianjie\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!aMatch) continue;
    let href = aMatch[1].trim();
    if (!href.startsWith('http')) href = domain.replace(/\/+$/, '') + href;
    if (!href.includes('/btcililianjie/')) continue;
    const title = aMatch[2].replace(/<[^>]+>/g, '').trim();
    if (!title) continue;
    let size = '';
    const sizeM = seg.match(/文件[：:]\s*<span[^>]*>\s*([\d.]+\s*(?:B|KB|MB|GB|TB))/i);
    if (sizeM) size = sizeM[1].replace(/\s+/g, ' ');
    items.push({ name: title, size, date: '', detailUrl: href, source: 'cilichi' });
  }
  return items;
}
async function batchFetchCilichiMagnets(items, waitUntil) {
  const CONCURRENCY = 5;
  const results = [];
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      const item = items[i];
      try {
        const html = await fetchWithCache(item.detailUrl, 3600, waitUntil);
        const m = html.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}/)
          || html.match(/magnet:\?xt=urn:([a-fA-F0-9]{40})/);
        if (m) {
          const magnetUrl = m[0].includes('btih:') ? m[0] : `magnet:?xt=urn:btih:${m[1]}`;
          results.push({ name: item.name, size: item.size, date: item.date, magnet: simplifyMagnet(magnetUrl), detailUrl: item.detailUrl, source: 'cilichi' });
        }
      } catch (e) {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}

// ========== Bitsearch ==========
async function fetchFromBitsearch(query, page, sort, waitUntil) {
  const domains = getDomainsConfig().bitsearch || ['https://bitsearch.eu'];
  if (domains.length === 0) return [];
  let sortBy = 'relevance';
  if (sort === 'seeders' || sort === 'hits' || sort === 'requests') sortBy = 'seeders';
  else if (sort === 'length' || sort === 'size') sortBy = 'size';
  else if (sort === 'time' || sort === 'newest') sortBy = 'created';
  const pageNum = Math.max(1, page || 1);
  for (const domain of domains) {
    try {
      const url = `${domain}/search?q=${encodeURIComponent(query)}&sortBy=${sortBy}&page=${pageNum}`;
      const html = await fetchWithCache(url, 1800, waitUntil);
      const items = parseBitsearchList(html, domain);
      if (items.length > 0) return items;
    } catch (err) { console.error(`Bitsearch domain ${domain} failed:`, err); }
  }
  return [];
}
function parseBitsearchList(html, domain) {
  const items = [];
  const cards = html.split('<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6');
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    const titleM = card.match(/<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleM) continue;
    let title = titleM[2].replace(/<[^>]+>/g, '').trim();
    const magM = card.match(/btih:([A-F0-9]{40})/);
    if (!magM) continue;
    const magnet = 'magnet:?xt=urn:btih:' + magM[1].toLowerCase();
    let size = '';
    const sizeM = card.match(/<i class="fas fa-download"><\/i>\s*<span>([\d.]+\s*(?:B|KB|MB|GB|TB))/);
    if (sizeM) size = sizeM[1];
    let date = '';
    const dateM = card.match(/<i class="fas fa-calendar"><\/i>\s*<span>([\d/]+)<\/span>/);
    if (dateM) {
      const parts = dateM[1].split('/');
      if (parts.length === 3) date = `${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`;
    }
    let seeders = '';
    const seedM = card.match(/<i class="fas fa-arrow-up"><\/i>\s*<span class="font-medium">(\d+)<\/span>\s*<span>seeders/);
    if (seedM) seeders = seedM[1];
    let detailUrl = titleM[1];
    if (detailUrl.startsWith('/')) detailUrl = domain.replace(/\/+$/, '') + detailUrl;
    items.push({
      name: title,
      size,
      date,
      magnet: simplifyMagnet(magnet),
      detailUrl,
      source: 'bitsearch',
      seeders,
    });
  }
  return items;
}

async function fetchFromJuniorter(query, page, sort, waitUntil) {
  const juniorterSort = (sort === 'time' || sort === 'newest') ? 'date' : 'seeds';
  const apiUrl = `${JUNIORTER_API}?q=${encodeURIComponent(query)}&sort=${juniorterSort}&pageSize=50&providers=${encodeURIComponent(JUNIORTER_PROVIDERS)}`;

  const cacheKey = new Request(apiUrl, { method: 'GET' });
  const cache = caches.default;

  let response = await cache.match(cacheKey);
  if (!response) {
    response = await fetch(apiUrl, {
      headers: {
        'Accept': 'text/event-stream',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://torrent.juniorter.in/ch/',
      },
    });
    if (!response.ok) throw new Error(`Juniorter HTTP ${response.status}`);

    const cacheResponse = new Response(await response.clone().text(), {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'public, max-age=1800' },
    });
    if (waitUntil) waitUntil(cache.put(cacheKey, cacheResponse));
    else await cache.put(cacheKey, cacheResponse);
  }

  return parseJuniorterSSE(await response.text());
}

function parseJuniorterSSE(text) {
  const items = [];
  let currentEvent = null, currentData = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('event: ')) currentEvent = line.slice(7).trim();
    else if (line.startsWith('data: ')) currentData = line.slice(6);
    else if (line === '' && currentEvent && currentData) {
      if (currentEvent === 'provider') {
        try {
          const parsed = JSON.parse(currentData);
          if (parsed.ok && Array.isArray(parsed.results)) {
            for (const r of parsed.results) {
              if (r.magnet && r.title) {
                items.push({
                  name: r.title,
                  size: r.size || '',
                  date: r.date ? r.date.slice(0, 10) : '',
                  seeds: r.seeds || 0,
                  peers: r.peers || 0,
                  magnet: simplifyMagnet(r.magnet),
                  detailUrl: r.url || '',
                  source: 'juniorter',
                });
              }
            }
          }
        } catch (e) {}
      }
      currentEvent = null; currentData = '';
    }
  }
  return items;
}

// ========== 小草磁力 ==========
function getXiaocaoSortPath(sort) {
  switch (sort) {
    case 'length': return '-length';
    case 'time': return '-time';
    case 'requests': return '-requests';
    default: return '';
  }
}

async function fetchFromXiaocao(query, page, sort, waitUntil) {
  const config = getDomainsConfig();
  const domains = config.xiaocao;
  if (domains.length === 0) return [];
  const sortPath = getXiaocaoSortPath(sort);

  for (const domain of domains) {
    try {
      const html = await fetchWithCache(`${domain}/search/kw-${encodeURIComponent(query)}${sortPath}-${page}.html`, 3600, waitUntil);
      if (!html.includes('search-item')) continue;
      const items = parseXiaocaoResults(html, domain);
      if (items.length > 0) return items;
    } catch (err) {
      console.error(`Xiaocao domain ${domain} failed:`, err);
    }
  }
  return [];
}

function parseXiaocaoResults(html, domain) {
  const items = [];
  const parts = html.split(/<div class="search-item[^"]*">/);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const titleMatch = block.match(/<a[^>]+href="(\/hash\/([a-fA-F0-9]{40})\.html)"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    const name = titleMatch[3].replace(/<[^>]+>/g, '').trim();
    if (!name) continue;

    const sizeMatch = block.match(/文件大小:\s*<b[^>]*>([^<]+)<\/b>/);
    const dateMatch = block.match(/创建时间:\s*(?:&nbsp;|\s)*<b>([^<]+)<\/b>/);
    const hotMatch = block.match(/下载热度:\s*(?:&nbsp;|\s)*<b>([^<]+)<\/b>/);

    items.push({
      name,
      size: sizeMatch ? sizeMatch[1].trim() : '',
      date: dateMatch ? dateMatch[1].trim() : '',
      hot: hotMatch ? hotMatch[1].trim() : '',
      magnet: `magnet:?xt=urn:btih:${titleMatch[2]}`,
      detailUrl: `${domain}${titleMatch[1]}`,
      source: 'xiaocao',
    });
  }
  return items;
}

// ========== ØMagnet ==========
async function fetchFrom0Magnet(query, sort, page, waitUntil) {
  const searchHtml = await fetchWithCache(`https://0magnet.com/search?q=${encodeURIComponent(query)}&sort=${sort}&page=${page}`, 3600, waitUntil);
  const items = await parse0MagnetSearchResults(searchHtml);
  if (items.length === 0) return [];
  return await batchFetch0MagnetDetails(items, 5, waitUntil);
}

async function parse0MagnetSearchResults(html) {
  const items = [];
  const parts = html.split(/<tr[^>]*>/);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];
    const linkMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const detailPath = linkMatch[1];
    const name = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!name || !detailPath.includes('/')) continue;

    const sizeMatch = block.match(/<td[^>]*>\s*(\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB))\s*<\/td>/i);

    items.push({
      name,
      size: sizeMatch ? sizeMatch[1].trim() : '',
      date: '',
      detailPath,
      source: '0magnet',
    });
  }
  return items;
}

async function batchFetch0MagnetDetails(items, concurrency, waitUntil) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      const item = items[i];
      try {
        const detailUrl = item.detailPath.startsWith('http')
          ? item.detailPath
          : `https://0magnet.com${item.detailPath}`;
        const html = await fetchWithCache(detailUrl, 3600, waitUntil);
        const magnetMatch = html.match(/magnet:\?xt=urn:btih:[a-zA-Z0-9]{32,40}/);
        if (magnetMatch) {
          results.push({
            name: item.name,
            size: item.size,
            date: item.date,
            magnet: simplifyMagnet(magnetMatch[0]),
            detailUrl,
            source: '0magnet',
          });
        }
      } catch (e) {}
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// ========== 雨花阁 ==========
async function fetchFromYuhuage(query, page, sort, waitUntil) {
  const config = getDomainsConfig();
  const domains = config.yuhuage;
  if (domains.length === 0) return [];

  const searchPath = `/search/${encodeURIComponent(query)}-${page}.html`;

  for (const domain of domains) {
    try {
      const html = await fetchWithCache(`${domain}${searchPath}`, 3600, waitUntil);
      const items = parseYuhuageResults(html, domain);
      if (items.length > 0) return items;
    } catch (err) {
      console.error(`Yuhuage domain ${domain} failed:`, err);
    }
  }
  return [];
}

function parseYuhuageResults(html, domain) {
  const items = [];
  const parts = html.split(/<div class="search-item detail-width">/);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    const linkMatch = block.match(/<h3><a[^>]+href="\/hash\/([a-fA-F0-9]{40})\.html"[^>]*>([\s\S]*?)<\/a><\/h3>/);
    if (!linkMatch) continue;
    const infoHash = linkMatch[1];
    let name = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;

    const dateMatch = block.match(/创建时间：<b>\s*([^<]+)/);
    const sizeMatch = block.match(/大小：<b[^>]*>([^<]+)<\/b>/);

    items.push({
      name,
      size: sizeMatch ? sizeMatch[1].trim() : '',
      date: dateMatch ? dateMatch[1].trim() : '',
      magnet: `magnet:?xt=urn:btih:${infoHash}`,
      detailUrl: `${domain}/hash/${infoHash}.html`,
      source: 'yuhuage',
    });
  }
  return items;
}

// ========== 虎风 ==========
async function fetchFromHufeng(query, page, sort, waitUntil) {
  const config = getDomainsConfig();
  const domains = config.hufeng;
  if (domains.length === 0) return [];

  const searchPath = `/search/${encodeURIComponent(query)}_ctime_${page}.html`;

  for (const domain of domains) {
    try {
      const html = await fetchWithCache(`${domain}${searchPath}`, 3600, waitUntil);
      const items = parseHufengResults(html, domain);
      if (items.length > 0) return items;
    } catch (err) {
      console.error(`Hufeng domain ${domain} failed:`, err);
    }
  }
  return [];
}

function parseHufengResults(html, domain) {
  const items = [];
  const parts = html.split(/<div class="result">/);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    const linkMatch = block.match(/<a[^>]+href="\/([a-fA-F0-9]{40})\.html"[^>]*>([\s\S]*?)<\/a>/);
    if (!linkMatch) continue;
    const infoHash = linkMatch[1];
    let name = linkMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!name) continue;

    const dateMatch = block.match(/时间：\s*([^<]+)/);
    const sizeMatch = block.match(/大小：\s*([^<]+)/);

    items.push({
      name,
      size: sizeMatch ? sizeMatch[1].trim() : '',
      date: dateMatch ? dateMatch[1].trim() : '',
      magnet: `magnet:?xt=urn:btih:${infoHash}`,
      detailUrl: `${domain}/${infoHash}.html`,
      source: 'hufeng',
    });
  }
  return items;
}

// ========== U3C3 (cctv10) ==========
async function fetchFromCctv10(query, page, sort, waitUntil) {
  const config = getDomainsConfig();
  const domains = config.cctv10;
  CCTV10_DEBUG.domains = domains;
  CCTV10_DEBUG.query = query;

  if (domains.length === 0) return [];

  for (const domain of domains) {
    try {
      const homeHtml = await fetchWithCache(`${domain}/`, 300, waitUntil);
      CCTV10_DEBUG.homeLen = homeHtml.length;
      CCTV10_DEBUG.homeHasNmefafej = homeHtml.includes('nmefafej');

      let search2 = null;
      const matches = [...homeHtml.matchAll(/nmefafej\s*=\s*["']([a-zA-Z0-9]+)["']/g)];
      CCTV10_DEBUG.matches = matches.map(m => m[1]);
      if (matches.length > 0) {
        search2 = matches[matches.length - 1][1];
      }

      if (!search2) {
        const m = homeHtml.match(/search2=([a-zA-Z0-9]+)/);
        if (m) search2 = m[1];
      }

      CCTV10_DEBUG.search2 = search2;

      if (!search2) {
        CCTV10_DEBUG.error = 'no search2 found';
        continue;
      }

      const searchPath = `/?search2=${search2}&search=${encodeURIComponent(query)}`;
      const searchUrl = `${domain}${searchPath}`;
      CCTV10_DEBUG.searchUrl = searchUrl;

      const html = await fetchWithCache(searchUrl, 3600, waitUntil);
      CCTV10_DEBUG.searchLen = html.length;
      CCTV10_DEBUG.searchHasTorrentList = html.includes('torrent-list');

      if (!html.includes('torrent-list')) continue;
      const items = parseCctv10Results(html, domain);
      CCTV10_DEBUG.parsedCount = items.length;

      if (items.length > 0) return items;
    } catch (err) {
      CCTV10_DEBUG.error = String(err);
      console.error(`Cctv10 domain ${domain} failed:`, err);
    }
  }
  return [];
}

function parseCctv10Results(html, domain) {
  const items = [];
  const parts = html.split(/<tr class="default">/);
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i];

    const magnetMatch = block.match(/href="(magnet:\?xt=urn:btih:([a-fA-F0-9]{40})[^"]*)"/);
    if (!magnetMatch) continue;
    const magnet = simplifyMagnet(magnetMatch[1]);
    const infoHash = magnetMatch[2];

    const titleMatch = block.match(/<a href="\/view\?id=[^"]+"[^>]*>([\s\S]*?)<\/a>/);
    if (!titleMatch) continue;
    let name = titleMatch[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) continue;

    const tds = block.match(/<td[^>]*>([\s\S]*?)<\/td>/g) || [];
    let size = '';
    let date = '';
    for (const td of tds) {
      const content = td.replace(/<[^>]+>/g, '').trim();
      if (!size && /^\d+(\.\d+)?\s*(B|KB|MB|GB|TB)$/i.test(content)) {
        size = content;
      }
      if (!date && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(content)) {
        date = content;
      }
    }

    items.push({
      name,
      size,
      date,
      magnet,
      detailUrl: `${domain}/view?id=${infoHash}`,
      source: 'cctv10',
    });
  }
  return items;
}

// ========== 磁力猫 ==========
function decodeAtobHtml(html) {
  const m = html.match(/window\.atob\("([^"]+)"\)/);
  if (!m) return null;
  try {
    return decodeURIComponent(atob(m[1]));
  } catch (e) {
    return null;
  }
}

async function fetchFromCilimao(query, page, sort, waitUntil) {
  const config = getDomainsConfig();
  const domains = config.cilimao;
  CILIMAO_DEBUG.domains = domains;
  CILIMAO_DEBUG.query = query;

  if (domains.length === 0) {
    CILIMAO_DEBUG.error = 'no domains';
    return [];
  }

  // btoa 只支持 Latin-1：中文等非 ASCII 关键词会抛 InvalidCharacterError，捕获后跳过该源
  let wordB64;
  try { wordB64 = btoa(query).replace(/=+$/, ''); } catch (e) { CILIMAO_DEBUG.error = 'btoa non-latin1: ' + e.message; return []; }
  CILIMAO_DEBUG.wordB64 = wordB64;

  for (const domain of domains) {
    try {
      const searchUrl = `${domain}/search?word=${wordB64}&sort=rele&p=${page}`;
      CILIMAO_DEBUG.searchUrl = searchUrl;

      const html = await fetchWithCache(searchUrl, 1800, waitUntil);
      CILIMAO_DEBUG.htmlLen = html.length;

      const decoded = decodeAtobHtml(html);
      CILIMAO_DEBUG.decodedLen = decoded ? decoded.length : 0;

      if (!decoded) {
        CILIMAO_DEBUG.error = 'decodeAtobHtml failed';
        continue;
      }

      const links = [];
      const linkRe = /<a[^>]+href="(\/information\/[a-zA-Z0-9]+)"[^>]*>([\s\S]*?)<\/a>/g;
      let m;
      while ((m = linkRe.exec(decoded)) !== null) {
        const detailPath = m[1];
        const name = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (name) links.push({ detailPath, name });
      }

      CILIMAO_DEBUG.linksCount = links.length;

      if (links.length === 0) {
        CILIMAO_DEBUG.error = 'no links parsed';
        continue;
      }

      const items = await batchFetchCilimaoDetails(links, 5, domain, waitUntil);
      CILIMAO_DEBUG.itemsCount = items.length;

      if (items.length > 0) return items;
    } catch (err) {
      CILIMAO_DEBUG.error = String(err);
      console.error(`Cilimao domain ${domain} failed:`, err);
    }
  }
  return [];
}

async function batchFetchCilimaoDetails(links, concurrency, domain, waitUntil) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < links.length) {
      const i = index++;
      const link = links[i];
      try {
        const detailUrl = `${domain}${link.detailPath}`;
        const html = await fetchWithCache(detailUrl, 3600, waitUntil);
        const decoded = decodeAtobHtml(html);
        if (!decoded) continue;

        const magnetMatch = decoded.match(/href="(magnet:\?xt=urn:btih:[a-fA-F0-9]{40}[^"]*)"/);
        if (!magnetMatch) continue;
        const magnet = simplifyMagnet(magnetMatch[1]);

        const sizeMatch = decoded.match(/文件大小：<\/b>([^<]+)<\/b>/);
        const dateMatch = decoded.match(/收录时间：<\/b>\s*([^<]+)/);

        results.push({
          name: link.name,
          size: sizeMatch ? sizeMatch[1].trim() : '',
          date: dateMatch ? dateMatch[1].trim() : '',
          magnet,
          detailUrl,
          source: 'cilimao',
        });
      } catch (e) {}
    }
  }

  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

// 单次 HTTP 请求超时（fetchWithCache 用）
const PER_HTTP_TIMEOUT_MS = 10000;

// ========== 工具函数 ==========
async function fetchWithCache(url, ttl, waitUntil) {
  const cacheKey = new Request(url, { method: 'GET' });
  const cache = caches.default;

  let response = await cache.match(cacheKey);
  if (!response) {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      // 单次 HTTP 请求 10s 超时（再叠加每源整体 12s 上限），防止某个连接挂死
      signal: AbortSignal.timeout(PER_HTTP_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

    const text = await response.clone().text();
    const cacheResponse = new Response(text, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': `public, max-age=${ttl}`,
      },
    });
    if (waitUntil) waitUntil(cache.put(cacheKey, cacheResponse));
    else await cache.put(cacheKey, cacheResponse);

    response = new Response(text, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return await response.text();
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// ========== 查询规范化 + 本地过滤（借鉴 magnet-finder：站点只捞候选，精确匹配在本地） ==========
// 技术词：发站点前剥掉（站点的关键词搜索往往匹配不到 1080p/webrip/x264 这类词）
const QUERY_NOISE_RE = /^(?:s\d{1,2}(?:e\d{1,3})?|e\d{1,3}|\d{3,4}p|x26[45]|h26[45]|hevc|xvid|divx|web|webrip|webdl|dl|hdtv|bluray|brrip|bdrip|dvdrip|remux|repack|proper|internal|amzn|dsnp|nf|hmax|aac|ac3|eac3|ddp\d?|dts|10bit|hdr|sdr|multi|complete|season|episode|6ch|2ch)$/i;
// 停用词：1337x 是宽松 OR 匹配，and/the 这类词会让噪音爆炸（搜 Tom and Jerry 全是含 and 的片）
const X1337X_STOPWORDS = new Set(['and', 'or', 'the', 'a', 'an', 'of', 'for', 'with', 'in', 'on', 'at', 'to', 'by', 'is']);

function normalizeTitle(s) {
  return String(s == null ? '' : s).toLowerCase()
    .replace(/[._+\-\[\](){}:,!?'"~\\/|@#$%^&*=<>;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeQuery(query) {
  return normalizeTitle(query).split(' ').filter(Boolean);
}

/** 标题是否包含全部 token（子串匹配） */
function titleMatchesTokens(title, tokens) {
  if (!tokens || !tokens.length) return true;
  const t = normalizeTitle(title);
  return tokens.every((tok) => t.indexOf(tok) >= 0);
}

/** 宽泛查询：剥技术词 + 停用词，只留核心词发给站点（本地过滤保证精度） */
function broadQuery(query) {
  const tokens = tokenizeQuery(query);
  const kept = tokens.filter((t) => !QUERY_NOISE_RE.test(t) && !X1337X_STOPWORDS.has(t));
  return (kept.length ? kept : tokens).join(' ');
}

function isoFromUnix(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : '';
}

// ========== TPB（apibay.org 官方 API，一次返回全部命中） ==========
const TPB_DOMAINS = ['https://apibay.org'];
// ========== The Pirate Bay（apibay JSON API） ==========
async function fetchFromTpb(query, page, sort, waitUntil) {
  const cfg = getDomainsConfig().tpb;
  const domains = (cfg && cfg.length) ? cfg : TPB_DOMAINS;
  for (const domain of domains) {
    try {
      const url = `${domain}/q.php?q=${encodeURIComponent(query)}&cat=0`;
      const text = await fetchWithCache(url, 900, waitUntil);
      let arr;
      try { arr = JSON.parse(text); } catch (e) { throw new Error('JSON解析失败'); }
      if (!Array.isArray(arr)) continue;
      return arr
        .filter((r) => r && r.id !== '0' && r.info_hash && !/^0+$/.test(r.info_hash))
        .map((r) => ({
          name: r.name || '',
          size: formatBytes(Number(r.size) || 0),
          date: isoFromUnix(r.added),
          seeds: Number(r.seeders) || 0,
          peers: Number(r.leechers) || 0,
          magnet: `magnet:?xt=urn:btih:${String(r.info_hash).toLowerCase()}`,
          detailUrl: r.id ? `https://thepiratebay.org/description.php?id=${r.id}` : '',
          source: 'tpb',
          imdb: r.imdb || '',
        }))
        .filter((it) => it.name && it.magnet);
    } catch (err) {
      console.error(`TPB domain ${domain} failed:`, err);
    }
  }
  return [];
}

// ========== PirateBay HTML 版（thepiratebay.bond） ==========
async function fetchFromPiratebay(query, page, sort, waitUntil) {
  const cfg = getDomainsConfig().piratebay;
  let domains = (cfg && cfg.length) ? [...cfg] : ['https://thepiratebay.bond'];
  // 自动发现：先从 piratebayproxy.info 提取可用域名
  try {
    const proxyHtml = await fetchWithCache('https://piratebayproxy.info/', 3600, waitUntil);
    const found = [...proxyHtml.matchAll(/href="(https?:\/\/thepiratebay\.[a-z0-9.-]+)\/?/g)]
      .map(m => m[1].replace(/\/+$/, ''));
    if (found.length > 0) {
      // 把发现的域名排到前面，已配置的也保留
      domains = [...new Set([...found, ...domains])];
    }
  } catch (e) { /* 代理页抓不到就用配置的 */ }
  let sortNum = '99';
  if (sort === 'time' || sort === 'newest') sortNum = '3';
  else if (sort === 'length' || sort === 'size') sortNum = '5';
  else if (sort === 'seeders' || sort === 'hits' || sort === 'requests') sortNum = '8';
  else if (sort === 'leechers') sortNum = '9';
  const pageNum = Math.max(1, page || 1);
  for (const domain of domains) {
    try {
      const url = `${domain}/search/${encodeURIComponent(query)}/${pageNum}/${sortNum}/0`;
      const html = await fetchWithCache(url, 900, waitUntil);
      const items = parsePiratebayHtml(html, domain);
      if (items.length > 0) return items;
    } catch (err) {
      console.error(`Piratebay domain ${domain} failed:`, err.message);
    }
  }
  return [];
}
function parsePiratebayHtml(html, domain) {
  const items = [];
  const rows = html.split('<tr>').slice(1);
  for (const row of rows) {
    if (!row.includes('magnet:?xt=urn:btih:')) continue;
    const titleM = row.match(/<a[^>]+href="([^"]*\/torrent\/[^"]+)"[^>]*>([^<]+)<\/a>/);
    if (!titleM) continue;
    const title = titleM[2].trim();
    const magM = row.match(/href="(magnet:\?xt=urn:btih:[a-fA-F0-9]{40})/);
    if (!magM) continue;
    let date = '';
    const dateM = row.match(/<td>([\d]{2}-[\d]{2})&nbsp;([\d]{4})<\/td>/);
    if (dateM) date = `${dateM[2]}-${dateM[1]}`;
    let size = '';
    const sizeM = row.match(/<td align="right">([\d.]+)&nbsp;([A-Za-z]+)<\/td>/);
    if (sizeM) size = sizeM[1] + ' ' + sizeM[2];
    const nums = [...row.matchAll(/<td align="right">(\d+)<\/td>/g)].map(m => m[1]);
    const seeders = nums[0] || '';
    const leechers = nums[1] || '';
    let detailUrl = titleM[1];
    if (detailUrl.startsWith('/')) detailUrl = domain.replace(/\/+$/, '') + detailUrl;
    items.push({
      name: title,
      size,
      date,
      magnet: simplifyMagnet(magM[1]),
      detailUrl,
      source: 'piratebay',
      seeders,
      peers: leechers,
    });
  }
  return items;
}

// ========== therarbg（RARBG 延续，JSON API；多词必须 %20 编码，用 + 会返回 0 条） ==========
const THERARBG_DOMAINS = ['https://therarbg.com'];
async function fetchFromTherarbg(query, page, sort, waitUntil) {
  const cfg = getDomainsConfig().therarbg;
  const domains = (cfg && cfg.length) ? cfg : THERARBG_DOMAINS;
  for (const domain of domains) {
    try {
      const kw = encodeURIComponent(query).replace(/\+/g, '%20');
      const url = `${domain}/get-posts/keywords:${kw}/?format=json`;
      const text = await fetchWithCache(url, 900, waitUntil);
      let j;
      try { j = JSON.parse(text); } catch (e) { throw new Error('JSON解析失败'); }
      if (!j || !Array.isArray(j.results)) continue;
      return j.results
        .map((r) => ({
          name: r.n || '',
          size: formatBytes(Number(r.s) || 0),
          date: isoFromUnix(r.a),
          seeds: Number(r.se) || 0,
          peers: Number(r.le) || 0,
          magnet: r.h ? `magnet:?xt=urn:btih:${String(r.h).toLowerCase()}` : '',
          detailUrl: r.pk ? `${domain}/post-detail/${r.pk}/` : '',
          source: 'therarbg',
          imdb: r.i || '',
        }))
        .filter((it) => it.name && it.magnet);
    } catch (err) {
      console.error(`therarbg domain ${domain} failed:`, err);
    }
  }
  return [];
}

// ========== EZTV（只能按 imdb_id 查；id 由 fetchFromEztvSmart 从 TPB/therarbg 结果推断） ==========
const EZTV_DOMAINS = ['https://eztvx.to', 'https://eztv.re', 'https://eztv.tf'];
async function fetchFromEztv(imdbId, page, sort, waitUntil) {
  const id = String(imdbId || '').replace(/^tt/i, '');
  if (!/^\d{5,}$/.test(id)) return [];
  const cfg = getDomainsConfig().eztv;
  const domains = (cfg && cfg.length) ? cfg : EZTV_DOMAINS;
  for (const domain of domains) {
    try {
      const url = `${domain}/api/get-torrents?imdb_id=${id}&limit=100&page=${Math.max(1, page || 1)}`;
      const text = await fetchWithCache(url, 3600, waitUntil);
      let j;
      try { j = JSON.parse(text); } catch (e) { throw new Error('JSON解析失败'); }
      if (!j || !Array.isArray(j.torrents)) continue;
      return j.torrents
        .map((t) => ({
          name: t.title || t.filename || '',
          size: formatBytes(Number(t.size_bytes) || 0),
          date: isoFromUnix(t.date_released_unix),
          seeds: Number(t.seeds) || 0,
          peers: Number(t.peers) || 0,
          magnet: t.magnet_url ? simplifyMagnet(t.magnet_url) : '',
          detailUrl: t.episode_url || '',
          source: 'eztv',
        }))
        .filter((it) => it.name && it.magnet);
    } catch (err) {
      console.error(`EZTV domain ${domain} failed:`, err);
    }
  }
  return [];
}

// EZTV 无关键词搜索：先从带 imdb 的源（TPB/therarbg）收集 imdb_id（取出现最多的），再查 EZTV。
// 依赖 fetchWithCache：主任务已抓过的话这里直接命中缓存，不重复网络请求。
async function fetchFromEztvSmart(query, page, sort, waitUntil) {
  const counts = new Map();
  for (const fn of [fetchFromTpb, fetchFromTherarbg]) {
    try {
      const items = await fn(query, page, sort, waitUntil);
      for (const it of items) {
        const id = String(it.imdb || '').replace(/^tt/i, '');
        if (/^\d{5,}$/.test(id)) counts.set(id, (counts.get(id) || 0) + 1);
      }
    } catch (e) { /* 单个源失败不影响推断 */ }
  }
  if (!counts.size) return [];
  let best = '', bestN = 0;
  for (const [id, n] of counts) {
    if (n > bestN) { best = id; bestN = n; }
  }
  return fetchFromEztv(best, page, sort, waitUntil);
}

// 供回归测试引用的纯函数（不联网）
export {
  normalizeTitle,
  tokenizeQuery,
  broadQuery,
  titleMatchesTokens,
  parseX1337xRows,
  parseCilibaikeResults,
  dedupItems,
  simplifyMagnet,
  formatBytes,
  b64FromUtf8,
};

// 按需抓取磁力链接：根据 detailUrl 路径模式自动选择正则
export async function fetchMagnetFromDetailUrl(detailUrl) {
  if (!detailUrl) return '';
  try {
    const html = await fetchWithCache(detailUrl, 3600);
    let m;
    // btfox: <input id="mag-link" value="magnet:..."
    m = html.match(/<input[^>]+id="mag-link"[^>]+value="(magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40})"/);
    if (m) return simplifyMagnet(m[1]);
    // zhongziba: <textarea id="magnetLink">magnet:...</textarea>
    m = html.match(/<textarea[^>]+id="magnetLink"[^>]*>(magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40})/);
    if (m) return simplifyMagnet(m[1]);
    // taocili: 直接 magnet:?xt=...
    if (detailUrl.includes('/magnet/')) {
      m = html.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}/);
      if (m) return simplifyMagnet(m[0]);
    }
    // cilichi: 直接 magnet:?xt=...
    m = html.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{32,40}/);
    if (m) return simplifyMagnet(m[0]);
    return '';
  } catch (e) {
    return '';
  }
}

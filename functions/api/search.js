// Pages Functions - /api/search

import domainsConfig from '../../domains.json';

const JUNIORTER_API = 'https://torrent.juniorter.in/api/search-stream';
const JUNIORTER_PROVIDERS = [
  'yts', 'eztv', 'torrentclaw', 'piratebay', 'knaben', 'limetorrents',
  'torrentfunk', 'torrentdownloads', 'torlock', 'yourbittorrent', 'magnetz',
  'bitsearch', 'solidtorrents', 'torrentscsv', 'therarbg', 'animetosho', 'nyaa',
  'mikan', 'tokyotosho', 'dmhy', 'acgrip', 'subsplease', 'rutor',
  'audiobookbay', 'academictorrents'
].join(',');

const KNABEN_API = 'https://api.knaben.org/v1';

let CCTV10_DEBUG = {};
let CILIMAO_DEBUG = {};

export async function onRequest(context) {
  const { request, waitUntil } = context;
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const sort = url.searchParams.get('sort') || 'relevance';

  const sourcesParam = url.searchParams.get('sources') || '0magnet,xiaocao,juniorter,cilibaike,knaben,yuhuage,hufeng,cctv10,cilimao,ciliso,taocili,tpb,therarbg,eztv,btfox';
  const sources = sourcesParam.split(',').map(s => s.trim()).filter(Boolean);

  if (!query) {
    return jsonResponse({ error: 'Missing query parameter' }, 400);
  }

  CCTV10_DEBUG = {};
  CILIMAO_DEBUG = {};

  const startTime = Date.now();

  try {
    const tasks = [];

    if (sources.includes('0magnet')) {
      tasks.push({ name: '0magnet', promise: fetchFrom0Magnet(query, sort, page, waitUntil) });
    }
    if (sources.includes('xiaocao')) {
      tasks.push({ name: 'xiaocao', promise: fetchFromXiaocao(query, page, sort, waitUntil) });
    }
    if (sources.includes('juniorter')) {
      tasks.push({ name: 'juniorter', promise: fetchFromJuniorter(query, page, sort, waitUntil) });
    }
    if (sources.includes('cilibaike')) {
      tasks.push({ name: 'cilibaike', promise: fetchFromCilibaike(query, page, sort, waitUntil, 'cilibaike') });
    }
    if (sources.includes('knaben')) {
      tasks.push({ name: 'knaben', promise: fetchFromKnaben(query, page, sort, waitUntil) });
    }
    if (sources.includes('yuhuage')) {
      tasks.push({ name: 'yuhuage', promise: fetchFromYuhuage(query, page, sort, waitUntil) });
    }
    if (sources.includes('hufeng')) {
      tasks.push({ name: 'hufeng', promise: fetchFromHufeng(query, page, sort, waitUntil) });
    }
    if (sources.includes('cctv10')) {
      tasks.push({ name: 'cctv10', promise: fetchFromCctv10(query, page, sort, waitUntil) });
    }
    if (sources.includes('cilimao')) {
      tasks.push({ name: 'cilimao', promise: fetchFromCilimao(query, page, sort, waitUntil) });
    }
    if (sources.includes('ciliso')) {
      tasks.push({ name: 'ciliso', promise: fetchFromCilibaike(query, page, sort, waitUntil, 'ciliso') });
    }
    if (sources.includes('taocili')) {
      tasks.push({ name: 'taocili', promise: fetchFromTaocili(query, page, sort, waitUntil) });
    }
    if (sources.includes('tpb')) {
      tasks.push({ name: 'tpb', promise: fetchFromTpb(query, page, sort, waitUntil) });
    }
    if (sources.includes('therarbg')) {
      tasks.push({ name: 'therarbg', promise: fetchFromTherarbg(query, page, sort, waitUntil) });
    }
    if (sources.includes('eztv')) {
      tasks.push({ name: 'eztv', promise: fetchFromEztvSmart(query, page, sort, waitUntil) });
    }
    if (sources.includes('btfox')) {
      tasks.push({ name: 'btfox', promise: fetchFromBtfox(query, page, sort, waitUntil) });
    }

    const results = await Promise.allSettled(tasks.map(t => t.promise));

    const allItems = [];
    const debug = {};

    results.forEach((r, i) => {
      const name = tasks[i].name;
      if (r.status === 'fulfilled') {
        allItems.push(...r.value);
        debug[`${name}Status`] = 'fulfilled';
        debug[`${name}Count`] = r.value.length;
      } else {
        console.error(`${name} failed:`, r.reason);
        debug[`${name}Status`] = 'rejected';
        debug[`${name}Count`] = 0;
        debug[`${name}Error`] = String(r.reason);
      }
    });

    const seen = new Set();
    const deduped = [];
    for (const item of allItems) {
      const hashMatch = item.magnet && item.magnet.match(/btih:([a-zA-Z0-9]{32,40})/);
      const key = hashMatch ? hashMatch[1].toLowerCase() : item.name;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }

    const timing = Date.now() - startTime;
    return jsonResponse({
      results: deduped,
      total: deduped.length,
      timing,
      sourceSites: buildSourceSites(),
      debug: {
        sources: sources,
        page: page,
        totalBeforeDedup: allItems.length,
        cctv10Raw: CCTV10_DEBUG,
        cilimaoRaw: CILIMAO_DEBUG,
        ...debug,
      },
    });

  } catch (err) {
    console.error('Search error:', err);
    return jsonResponse({ error: 'Search failed', detail: String(err), cctv10Raw: CCTV10_DEBUG, cilimaoRaw: CILIMAO_DEBUG }, 502);
  }
}

// 各源站点主页（供前端"源标签右键跳转源站"用）
function buildSourceSites() {
  const cfg = getDomainsConfig();
  const sites = {};
  for (const key of Object.keys(cfg)) {
    const arr = cfg[key];
    if (Array.isArray(arr) && arr.length) sites[key] = arr[0];
  }
  // 硬编码源（不在 domains.json 里）
  sites['0magnet'] = 'https://0magnet.com';
  sites['juniorter'] = 'https://torrent.juniorter.in';
  sites['knaben'] = 'https://knaben.xyz';
  return sites;
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

// ========== 读取 domains.json ==========
function getDomainsConfig() {
  const data = domainsConfig || {};
  return {
    xiaocao: Array.isArray(data.xiaocao) ? data.xiaocao : [],
    cilibaike: Array.isArray(data.cilibaike) ? data.cilibaike : [],
    hufeng: Array.isArray(data.hufeng) ? data.hufeng : [],
    yuhuage: Array.isArray(data.yuhuage) ? data.yuhuage : [],
    cctv10: Array.isArray(data.cctv10) ? data.cctv10 : [],
    cilimao: Array.isArray(data.cilimao) ? data.cilimao : [],
    ciliso: Array.isArray(data.ciliso) ? data.ciliso : [],
    taocili: Array.isArray(data.taocili) ? data.taocili : [],
    tpb: Array.isArray(data.tpb) ? data.tpb : [],
    therarbg: Array.isArray(data.therarbg) ? data.therarbg : [],
    eztv: Array.isArray(data.eztv) ? data.eztv : [],
    btfox: Array.isArray(data.btfox) ? data.btfox : [],
  };
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
  const config = getDomainsConfig();
  const domains = config[sourceKey];
  if (domains.length === 0) return [];

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
      const html = await fetchWithCache(`${domain}${searchPath}?lang=zh_CN`, 3600, waitUntil);
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

// ========== Juniorter ==========
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

  const wordB64 = btoa(query).replace(/=+$/, '');
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

// ========== 工具函数 ==========
// ========== 淘磁力（内部 JSON API + 详情页补 magnet） ==========
function b64FromUtf8(str) {
  // Worker 安全：btoa 对 >U+00FF 字符会抛错，先转 UTF-8 字节再编码
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// 淘磁力发布页（wangzhi.icu/config.js）：域名经常更换，失败时实时拉取最新域名跟随
const TAOCILI_PUBLISH_URL = 'https://wangzhi.icu/config.js';
async function getFreshTaociliDomains(waitUntil) {
  try {
    const text = await fetchWithCache(TAOCILI_PUBLISH_URL, 600, waitUntil);
    // config.js 形如：{ id: 'cl', name: '淘磁力', urls: ['https://taociliX.shop', ...] }
    const block = (text.match(/\{[^{}]*淘磁力[^{}]*\}/) || [null])[0];
    if (!block) return [];
    const urls = [...block.matchAll(/['"](https?:\/\/[^'"]+)['"]/g)].map((m) => m[1]);
    return [...new Set(urls)].filter((u) => /^https?:\/\//.test(u));
  } catch (e) {
    return [];
  }
}

async function fetchFromTaocili(query, page, sort, waitUntil) {
  const config = getDomainsConfig();
  let domains = config.taocili || [];
  if (domains.length === 0) return [];

  const keyword = encodeURIComponent(b64FromUtf8(query));
  let sortParam = 'default';
  if (sort === 'time' || sort === 'newest') sortParam = 'atime';
  else if (sort === 'length') sortParam = 'size_desc';

  const start = Math.max(0, (Math.max(1, page || 1) - 1) * 20);
  const searchNotes = [];

  const tryDomains = async (list, label) => {
    for (const domain of list) {
      try {
        const apiUrl = `${domain}/apis/search?keyword=${keyword}&base64=1&detail=1&start=${start}&count=20&type=all&sort=${sortParam}`;
        let text;
        try {
          text = await fetchWithCache(apiUrl, 1800, waitUntil);
        } catch (err) {
          // 5xx（套 CF 的站对 Workers 出口常返回 520）：换移动端 UA 重试一次
          try {
            text = await fetchWithCache(apiUrl, 60, waitUntil, {
              'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            });
          } catch (err2) {
            throw new Error(`${err.message}; 移动UA重试: ${err2.message}`);
          }
        }
        let data;
        try { data = JSON.parse(text); } catch (e) { throw new Error('JSON解析失败'); }
        if (!data || data.code !== 0 || !Array.isArray(data.items)) {
          searchNotes.push(`${domain}${label}: code=${data && data.code} items=${data && Array.isArray(data.items) ? data.items.length : '无'}`);
          continue;
        }
        const rows = data.items.filter((it) => it && it.name && it._id).slice(0, 20);
        if (rows.length === 0) { searchNotes.push(`${domain}${label}: 搜索无结果`); continue; }
        const items = await batchFetchTaociliMagnets(rows, domain, waitUntil);
        if (items.length > 0) return items;
        const f = items.failures || {};
        searchNotes.push(`${domain}${label}: 搜索${rows.length}条但详情页全失败 (http=${f.http||0} 无magnet=${f.empty||0} 其他=${f.other||0})`);
      } catch (err) {
        searchNotes.push(`${domain}${label}: ${err && err.message ? err.message : String(err)}`);
        console.error(`Taocili domain ${domain} failed:`, err);
      }
    }
    return null;
  };

  // 第一轮：配置文件里的域名
  const r1 = await tryDomains(domains, '');
  if (r1) return r1;

  // 第二轮：配置全失败时，实时拉发布页最新域名跟随（站点换域名后自动恢复）
  const fresh = await getFreshTaociliDomains(waitUntil);
  const freshUnknown = fresh.filter((d) => !domains.includes(d));
  if (freshUnknown.length > 0) {
    const r2 = await tryDomains(freshUnknown, '(发布页)');
    if (r2) return r2;
  }

  // 把诊断信息抛给上层（debug.taociliError 可见），不静默吞掉
  throw new Error('淘磁力全域名失败: ' + (searchNotes.join(' | ') || '无可用域名'));
}

// 详情页并发抓 magnet（限量并发，单条失败跳过，不拖整体）
async function batchFetchTaociliMagnets(rows, domain, waitUntil) {
  const CONCURRENCY = 6;
  const results = [];
  const failures = { http: 0, empty: 0, other: 0 };
  let idx = 0;
  const worker = async () => {
    while (idx < rows.length) {
      const i = idx++;
      const row = rows[i];
      try {
        const detailUrl = `${domain}/magnet/${row._id}`;
        // 详情页加 Referer（站点可能校验来源），不用公共缓存以免串头
        const resp = await fetch(detailUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': `${domain}/`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
          },
        });
        if (!resp.ok) { failures.http++; continue; }
        const html = await resp.text();
        const m = html.match(/magnet:\?xt=urn:btih:[a-fA-F0-9]{40}/);
        if (!m) { failures.empty++; continue; }
        results.push({
          name: row.name,
          size: formatBytes(row.len),
          date: row.atime ? new Date(row.atime).toISOString().slice(0, 10) : '',
          magnet: simplifyMagnet(m[0]),
          detailUrl,
          source: 'taocili',
        });
      } catch (e) { failures.other++; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));
  results.failures = failures;
  return results;
}

// ========== BtFox ==========
// 普通 HTML 源；关键词无 padding base64；磁力在 /info/{id} 详情页
async function fetchFromBtfox(query, page, sort, waitUntil) {
  const domains = getDomainsConfig().btfox.length
    ? getDomainsConfig().btfox
    : ['https://btfox20.top'];
  if (domains.length === 0) return [];

  const wd = b64FromUtf8(query).replace(/=+$/, '');
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
      return await batchFetchBtfoxMagnets(items, waitUntil);
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

async function fetchWithCache(url, ttl, waitUntil, extraHeaders) {
  const cacheKey = new Request(url, { method: 'GET' });
  const cache = caches.default;

  let response = await cache.match(cacheKey);
  if (!response) {
    response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...(extraHeaders || {}),
      },
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
// ========== TPB（apibay 官方 API，一次返回全部命中） ==========
const TPB_DOMAINS = ['https://apibay.org'];
function isoFromUnix(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : '';
}

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
      // apibay 无结果时返回一条 id=0 的占位记录，要滤掉
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

// ========== EZTV（镜像 API，只能按 imdb_id 查询） ==========
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

// EZTV 只能按 IMDb 编号查：先从 TPB/RARBG 结果里收集 imdb 字段，取出现最多的编号去查
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

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

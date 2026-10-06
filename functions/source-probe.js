// 源连通性探测：对每个源发一次最小请求，能拿到“像样的响应”即判可达。
// 结果缓存在模块级（线上 Worker 冷启动、本地进程重启都会重新探测），默认 5 分钟。
// 本文件线上（functions/source-probe.js）与本地版（source-probe.js）共用，
// 只有顶部的域名来源 import 一行不同。

export const PROBE_TTL_MS = 5 * 60 * 1000;
// 单次请求 8s：健康的源都在 3s 内答完，留出余量给偶发慢响应，又不至于让死域名吃满整源预算
const PROBE_TIMEOUT_MS = 8000;
const PROBE_Q = 'the';  // 几乎所有源都有结果的词

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

function enc(s) { return encodeURIComponent(s); }
function b64Url(s) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function b64StdNoPad(s) { return btoa(s).replace(/=+$/, ''); }
function b64Utf8Enc(s) {
  return encodeURIComponent(btoa(String.fromCharCode(...new TextEncoder().encode(s))));
}
function hexUtf8(s) {
  let h = '';
  for (const b of new TextEncoder().encode(s)) h += b.toString(16).padStart(2, '0');
  return h;
}
function doms(list, fallback) {
  const arr = (Array.isArray(list) ? list : []).map((d) => String(d).replace(/\/+$/, '')).filter(Boolean);
  return arr.length ? arr : (fallback ? [fallback] : []);
}
// 域名池按顺序试，整源共用一份时间预算：并行开太多连接反而把每个域都拖到超时
const PROBE_SOURCE_BUDGET_MS = 12000;
const PROBE_DEADLINE = { at: Infinity };
async function raceDomains(list, probeOne) {
  const arr = list.slice(0, 4);
  if (!arr.length) return null;
  const deadline = Math.min(Date.now() + PROBE_SOURCE_BUDGET_MS, PROBE_DEADLINE.at);
  for (const d of arr) {
    if (Date.now() + 1500 > deadline) break;   // 预算不够再试一个域：剩下的时间宁可判“未探测”
    try {
      if (await probeOne(d) === true) return true;
    } catch (e) { /* 换下一个域 */ }
  }
  return false;
}

async function getRaw(url, headers, redirect) {
  const r = await fetch(url, {
    headers: { ...BASE_HEADERS, ...(headers || {}) },
    redirect: redirect || 'follow',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  let text = '';
  try { text = await r.text(); } catch (e) { /* 读不到正文时只按状态码判 */ }
  let setCookie = '';
  try { setCookie = (typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie().join('; ') : (r.headers.get('set-cookie') || '')); } catch (e) { /* ignore */ }
  return { ok: r.ok, status: r.status, text, setCookie, location: r.headers.get('location') || '' };
}
async function getJson(url, headers) {
  const r = await getRaw(url, headers);
  let j = null;
  try { j = JSON.parse(r.text); } catch (e) { /* 非 JSON 由调用方判失败 */ }
  return { ok: r.ok, status: r.status, j };
}
async function postJson(url, body, headers) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  let j = null;
  try { j = JSON.parse(await r.text()); } catch (e) { /* ignore */ }
  return { ok: r.ok, status: r.status, j };
}

// cilimao 的页面正文是 window.atob("...") 的混淆载荷
function decodeAtobPayload(html) {
  const m = String(html || '').match(/window\.atob\(\s*"([^"]+)"\s*\)/);
  if (!m) return '';
  try { return decodeURIComponent(atob(m[1])); } catch (e) { return ''; }
}

// 磁力宝：首访任意路径都会拿到“点击验证”页，需 POST act=challenge 解锁会话
async function probeCilibao(domain) {
  const url = `${domain}/s/${b64Utf8Enc(PROBE_Q)}?sort=rel&page=1`;
  let r = await getRaw(url, cilibaoHeaders());
  if (r.ok && !cilibaoIsChallenge(r.text)) return r.text.includes('search-item');

  const sess = (r.setCookie.match(/PHPSESSID=[^;]+/) || [])[0];
  if (!sess) return false;
  // 用验证页下发的会话解锁整站，再带会话重试搜索页
  await fetch(`${domain}/`, {
    method: 'POST',
    headers: { ...cilibaoHeaders(sess), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'act=challenge',
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }).catch(() => {});
  r = await getRaw(url, cilibaoHeaders(sess));
  return r.ok && !cilibaoIsChallenge(r.text) && r.text.includes('search-item');
}
function cilibaoIsChallenge(html) { return String(html || '').includes('验证页面') || String(html || '').includes('cf-im-under-attack'); }
function cilibaoHeaders(cookie) {
  const h = { ...BASE_HEADERS, 'Accept': 'text/html,application/xhtml+xml,*/*' };
  if (cookie) h['Cookie'] = cookie;
  return h;
}

// 每个源一个探测函数：true=可达 / false=不可达 / null=没有可用域名（不判红）
function buildProbes(cfg) {
  return {
    '0magnet': async () => {
      const r = await getRaw(`https://0magnet.com/search?q=${enc(PROBE_Q)}&sort=relevance&page=1`);
      return r.ok && /magnet:|torrent/i.test(r.text);
    },
    xiaocao: async () => raceDomains(doms(cfg.xiaocao), async (d) => {
      const r = await getRaw(`${d}/search/kw-${enc(PROBE_Q)}-1.html`);
      return r.ok && r.text.includes('search-item');
    }),
    // SSE 接口不会主动收尾，GET 整包会挂到超时；改探它的站点首页
    juniorter: async () => {
      const r = await getRaw('https://torrent.juniorter.in/ch/');
      return r.ok && /torrent/i.test(r.text);
    },
    cilibaike: async () => raceDomains(doms(cfg.cilibaike), async (d) => {
      const r = await getRaw(`${d}/search-${enc(PROBE_Q)}-0-0-1.html?lang=zh_CN`);
      return r.ok && r.text.includes('resource-card');
    }),
    knaben: async () => {
      const r = await postJson('https://api.knaben.org/v1', {
        search_type: '100%', search_field: 'title', query: PROBE_Q,
        order_by: 'seeders', order_direction: 'desc', from: 0, size: 1,
        hide_unsafe: true, hide_xxx: false,
      }, { 'Accept': 'application/json', 'Origin': 'https://knaben.xyz', 'Referer': 'https://knaben.xyz/' });
      return r.ok && !!r.j && Array.isArray(r.j.hits);
    },
    // 雨花阁的搜索路径会 302 到当前落地页：跳转本身就说明站点活着，按浏览器行为跟进反而拿到首页
    yuhuage: async () => raceDomains(doms(cfg.yuhuage), async (d) => {
      const r = await getRaw(`${d}/search/${enc(PROBE_Q)}-1.html`, {}, 'manual');
      if (r.status >= 300 && r.status < 400) return true;
      return r.ok && /magnet|torrent|磁力/i.test(r.text);
    }),
    hufeng: async () => raceDomains(doms(cfg.hufeng), async (d) => {
      const r = await getRaw(`${d}/search/${enc(PROBE_Q)}_ctime_1.html`);
      return r.ok && /class="result"|搜索结果|magnet/i.test(r.text);
    }),
    // U3C3 首页必须带出搜索令牌才算可用（只判 200 会把验证页算成可达）
    cctv10: async () => raceDomains(doms(cfg.cctv10), async (d) => {
      const r = await getRaw(`${d}/`);
      return r.ok && r.text.includes('nmefafej');
    }),
    cilimao: async () => raceDomains(doms(cfg.cilimao), async (d) => {
      const r = await getRaw(`${d}/search?word=${b64StdNoPad(PROBE_Q)}&sort=rele&p=1`);
      const inner = decodeAtobPayload(r.text) || r.text;
      return r.ok && /magnet|torrent|search/i.test(inner);
    }),
    ciliso: async () => raceDomains(doms(cfg.ciliso), async (d) => {
      const r = await getRaw(`${d}/search-${enc(PROBE_Q)}-0-0-1.html?lang=zh_CN`);
      return r.ok && r.text.includes('resource-card');
    }),
    x1337x: async () => raceDomains(doms(cfg.x1337x), async (d) => {
      const r = await getRaw(`${d}/search/${enc(PROBE_Q)}/1/`, { 'Referer': `${d}/` });
      if (/<title>\s*(just a moment|attention required|请稍候)/i.test(r.text)) return false;
      return r.ok && /torrent\/\d+|magnet/i.test(r.text);
    }),
    taocili: async () => raceDomains(doms(cfg.taocili), async (d) => {
      const r = await getJson(`${d}/apis/search?keyword=${b64Utf8Enc(PROBE_Q)}&base64=1&detail=1&start=0&count=1&type=all&sort=default`);
      return r.ok && !!r.j && r.j.code === 0;
    }),
    // apibay 对同时打来的 28 个探测偶尔直接拒（429/5xx）：失败后隔 1.2s 再试一次，
    // 免得把“搜索其实能用”的源误判成连不通；结果行顺序不稳，故全量找有效 id
    tpb: async () => {
      const list = doms(cfg.tpb, 'https://apibay.org');
      const once = async (d) => {
        const r = await getJson(`${d}/q.php?q=${enc(PROBE_Q)}&cat=0`);
        return r.ok && Array.isArray(r.j) && r.j.some((x) => x && String(x.id) !== '0');
      };
      if (await raceDomains(list, once) === true) return true;
      await new Promise((r) => setTimeout(r, 1200));
      return raceDomains(list, once);
    },
    tpbweb: async () => raceDomains(doms(cfg.tpbweb, 'https://tpb.re'), async (d) => {
      const r = await getJson(`${d}/api.php?url=/q.php?q=${enc(PROBE_Q)}&cat=`);
      return r.ok && (Array.isArray(r.j) || !!(r.j && Array.isArray(r.j.results)));
    }),
    // 海盗湾镜像换得勤：先问代理页要一批当前镜像再并行试
    piratebay: async () => {
      let list = doms(cfg.piratebay, 'https://thepiratebay.bond');
      try {
        const r = await getRaw('https://piratebayproxy.info/');
        const found = [...String(r.text).matchAll(/href="(https?:\/\/thepiratebay\.[a-z0-9.-]+)\/?/g)]
          .map((m) => m[1].replace(/\/+$/, ''));
        list = [...new Set([...found, ...list])];
      } catch (e) { /* 代理页挂了就用名单里的域 */ }
      return raceDomains(list, async (d) => {
        const r = await getRaw(`${d}/search/${enc(PROBE_Q)}/1/99/0`);
        return r.ok && /magnet:\?xt=urn:btih:|torrent\/\d+/i.test(r.text);
      });
    },
    therarbg: async () => {
      const d = doms(cfg.therarbg, 'https://therarbg.com')[0];
      const r = await getJson(`${d}/get-posts/keywords:${enc(PROBE_Q)}/?format=json`);
      return r.ok && !!(r.j && (Array.isArray(r.j.results) || typeof r.j.total === 'number'));
    },
    // torrents 字段在“零结果”时压根不出现，只能按接口是否给出正常应答来判
    eztv: async () => raceDomains(doms(cfg.eztv, 'https://eztvx.to'), async (d) => {
      const r = await getJson(`${d}/api/get-torrents?imdb_id=0457433&limit=1&page=1`);
      return r.ok && !!r.j && (Array.isArray(r.j.torrents) || typeof r.j.torrents_count === 'number');
    }),
    btfox: async () => raceDomains(doms(cfg.btfox, 'https://btfox20.top'), async (d) => {
      const r = await getRaw(`${d}/s?wd=${b64Url(PROBE_Q)}&sort=rele&page=1`);
      return r.ok && /class="item"|torrent/i.test(r.text);
    }),
    zhongziba: async () => raceDomains(doms(cfg.zhongziba, 'https://zzb10.vip'), async (d) => {
      const r = await getRaw(`${d}/search?wd=${b64Url(PROBE_Q)}&sort=rel&page=1`);
      return r.ok && /<li class="media"|torrent/i.test(r.text);
    }),
    cilichi: async () => raceDomains(doms(cfg.cilichi, 'https://www.cilichi.pro'), async (d) => {
      const r = await getRaw(`${d}/cilichi/${hexUtf8(PROBE_Q)}_1_.html`);
      return r.ok && /card border-dashed|torrent/i.test(r.text);
    }),
    bitsearch: async () => raceDomains(doms(cfg.bitsearch, 'https://bitsearch.eu'), async (d) => {
      const r = await getRaw(`${d}/search?q=${enc(PROBE_Q)}`);
      return r.ok && /magnet|torrent/i.test(r.text);
    }),
    yts: async () => {
      const d = doms(cfg.yts, 'https://yts.lt')[0];
      const r = await getJson(`${d}/api/v2/list_movies.json?query_term=${enc(PROBE_Q)}&limit=1&page=1`);
      return r.ok && !!(r.j && r.j.status === 'ok');
    },
    miaocili: async () => raceDomains(doms(cfg.miaocili, 'https://www.miaocili.org'), async (d) => {
      const r = await getRaw(`${d}/search/${hexUtf8(PROBE_Q)}_1_id.html`);
      return r.ok && /search-item|magnet/i.test(r.text);
    }),
    xcisou: async () => raceDomains(doms(cfg.xcisou, 'https://search.cisoux.com'), async (d) => {
      const r = await getRaw(`${d}/search/${enc(PROBE_Q)}/all/relevance/any/1`);
      return r.ok && /result-item|magnet/i.test(r.text);
    }),
    torrentgalaxy: async () => raceDomains(doms(cfg.torrentgalaxy, 'https://torrentgalaxy.info'), async (d) => {
      const r = await getJson(`${d}/get-posts/keywords:${enc(PROBE_Q)}?format=json`);
      return r.ok && !!(r.j && (Array.isArray(r.j.results) || Array.isArray(r.j.torrents)));
    }),
    filemood: async () => raceDomains(doms(cfg.filemood, 'https://filemood.com'), async (d) => {
      const r = await getRaw(`${d}/result?q=${enc(PROBE_Q)}`);
      return r.ok && /dn-title|torrent/i.test(r.text);
    }),
    btsow: async () => raceDomains(doms(cfg.btsow, 'https://btsow.live'), async (d) => {
      const r = await postJson(`${d}/bts/data/api/search`, [{ search: PROBE_Q }, 1, 1], {
        'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest',
        'Origin': d, 'Referer': `${d}/`,
      });
      return r.ok && !!r.j && Array.isArray(r.j.data);
    }),
    cilibao: async () => raceDomains(doms(cfg.cilibao, 'https://clb21.vip'), probeCilibao),
    limetorrents: async () => raceDomains(doms(cfg.limetorrents, 'https://www.limetorrents.fun'), async (d) => {
      // 只看是否有真实结果行：空结果页/盾页都是 200，靠 -torrent-id.html + 40 位 hash 区分
      const r = await getRaw(`${d}/search/all/${enc(PROBE_Q)}/0/1/`);
      return r.ok && /-torrent-\d+\.html/.test(r.text) && /itorrents\.net\/torrent\/[a-f0-9]{40}\.torrent/i.test(r.text);
    }),
  };
}

let probeCache = { ts: 0, data: null };

// 限并发：一次 28 个源全并发时，慢源会把快源一起拖到超时（实测 cilichi 单发 1s 返回、
// 全并发时被挤到 10s 超时），限 8 并发后单发耗时接近平时、整轮仍在十秒级
const PROBE_CONCURRENCY = 8;
async function runLimited(entries, sources) {
  let i = 0;
  const worker = async () => {
    while (i < entries.length) {
      const [id, fn] = entries[i++];
      try {
        const r = await fn();
        sources[id] = r === null || r === undefined ? 'unknown' : (r ? 'up' : 'down');
      } catch (e) {
        sources[id] = 'down';
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, entries.length) }, worker));
}

// 返回 { sources: { id: 'up'|'down'|'unknown' }, checkedAt, timing }
export async function probeSources(cfg, opts = {}) {
  if (!opts.force && probeCache.data && Date.now() - probeCache.ts < PROBE_TTL_MS) {
    return { ...probeCache.data, cached: true };
  }
  const probes = buildProbes(cfg || {});
  const started = Date.now();
  const sources = {};
  await runLimited(Object.entries(probes), sources);
  const data = { sources, checkedAt: new Date().toISOString(), timing: Date.now() - started };
  probeCache = { ts: Date.now(), data };
  return data;
}

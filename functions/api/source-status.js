// Pages Functions - /api/source-status
// 返回各搜索源的连通性：{ sources: { id: 'up'|'down'|'unknown' }, checkedAt, timing }
// 探测逻辑在 functions/source-probe.js，结果在 Worker 内缓存 5 分钟，?refresh=1 强制重探。

import domainsConfig from '../domains.json';
import { probeSources } from './source-probe.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const force = url.searchParams.get('refresh') === '1';

  const cfg = {};
  const data = domainsConfig || {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) cfg[key] = value;
  }

  try {
    const result = await probeSources(cfg, { force });
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

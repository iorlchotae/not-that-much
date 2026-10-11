/**
 * A tiny CORS proxy for 「没吃多少」, for providers that refuse browser calls.
 *
 * WHY THIS EXISTS
 * ---------------
 * 「没吃多少」 is a static page. The browser makes the API request, so the API must
 * send CORS headers. A few providers never do -- opencode.ai, 豆包/火山方舟 -- and no
 * setting inside the app can change that. A desktop app (Electron/Tauri) can call them
 * directly because its requests go through Node/Rust, where CORS does not exist. This
 * Worker is how a web page gets the same ability.
 *
 * It runs on YOUR account and your key passes only through your own Worker. Do NOT
 * point the app at a random public CORS proxy instead: those forward your Authorization
 * header, which means handing your API key to a stranger.
 *
 * DEPLOY (about 2 minutes, free)
 * -----------------------------
 *   1. https://dash.cloudflare.com -> Workers & Pages -> Create -> Worker
 *   2. paste this file over the default code, click Deploy
 *   3. copy the URL it gives you, e.g. https://xxx.yyy.workers.dev
 *   4. in the app: 高级设置 -> 接口地址, replace the target with
 *        https://xxx.yyy.workers.dev/?url=https%3A%2F%2Fopencode.ai%2Fzen%2Fgo%2Fv1%2Fchat%2Fcompletions
 *      (the ?url= part must be percent-encoded)
 *
 * ADDING A PROVIDER
 * -----------------
 * Put its hostname in ALLOWED_HOSTS. That list is the whole point of the check: without
 * it this would be an open relay that anyone could point at anything.
 */

const ALLOWED_HOSTS = new Set([
  'opencode.ai',
  'ark.cn-beijing.volces.com',   // 豆包 / 火山方舟
  'api.z.ai',                    // 智谱国际版
]);

const CORS_HEADERS = {
  // Safe here: the app's fetch does not set credentials:'include', so a wildcard is
  // accepted even though the request carries an Authorization header.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
};

const fail = (message, status) =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });

export default {
  async fetch(request) {
    // the preflight the browser sends before the real request
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') return fail('only POST is proxied', 405);

    const target = new URL(request.url).searchParams.get('url');
    if (!target) return fail('missing ?url=', 400);

    let parsed;
    try {
      parsed = new URL(target);
    } catch {
      return fail('?url= is not a valid URL', 400);
    }
    if (parsed.protocol !== 'https:') return fail('only https targets', 400);
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return fail(`host not allowed: ${parsed.hostname}`, 403);
    }

    // forward the body and the key untouched
    const upstream = await fetch(parsed.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
        ...(request.headers.get('authorization')
          ? { Authorization: request.headers.get('authorization') }
          : {}),
      },
      body: await request.text(),
    });

    // hand the upstream response back verbatim, plus the headers the browser needs
    const response = new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers,
    });
    for (const [k, v] of Object.entries(CORS_HEADERS)) response.headers.set(k, v);
    return response;
  },
};

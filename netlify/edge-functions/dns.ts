const DEFAULT_DOH = 'cloudflare-dns.com';

function getEnv() {
  return {
    DOH: Deno.env.get('DOH') ?? '',
    PATH: Deno.env.get('PATH') ?? Deno.env.get('TOKEN') ?? 'dns-query',
    URL: Deno.env.get('URL') ?? '',
  };
}

function getDoHHost(env) {
  const base = (env.DOH || DEFAULT_DOH).replace(/^https?:\/\//, '');
  return base.split('/')[0];
}

function pickClientIP(headers) {
  const fwd = headers.get('x-forwarded-for') || '';
  const ip = fwd.split(',')[0]?.trim() ||
             headers.get('x-real-ip') ||
             headers.get('cf-connecting-ip') || '';
  return ip || '0.0.0.0';
}

async function handleDoH(request, env) {
  const host = getDoHHost(env);
  const upstream = new URL(`https://${host}/dns-query`);
  const url = new URL(request.url);

  const isGetWithDns = url.searchParams.has('dns');
  const isPost = request.method === 'POST';
  if (!isGetWithDns && !isPost) {
    return new Response('Bad Request', { status: 400 });
  }

  upstream.search = url.search;
  const headers = new Headers();
  headers.set('accept', 'application/dns-message');
  headers.set('host', host);

  let body = null;
  if (isPost) {
    const ct = request.headers.get('content-type') || '';
    if (!ct.startsWith('application/dns-message')) {
      return new Response('Unsupported Media Type', { status: 415 });
    }
    headers.set('content-type', 'application/dns-message');
    body = await request.arrayBuffer();
  }

  const res = await fetch(upstream.toString(), {
    method: isPost ? 'POST' : 'GET',
    headers,
    body,
  });

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: {
      'content-type': 'application/dns-message',
      'cache-control': 'no-store',
    },
  });
}

async function handleResolve(request, env) {
  const host = getDoHHost(env);
  const url = new URL(request.url);
  if (!url.searchParams.get('name')) {
    return new Response(JSON.stringify({ error: 'name required' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }
  const upstream = new URL(`https://${host}/resolve`);
  url.searchParams.forEach((v, k) => upstream.searchParams.set(k, v));

  const res = await fetch(upstream.toString(), {
    headers: { 'accept': 'application/dns-json', 'host': host },
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

function parseTrace(text) {
  const obj = {};
  for (const line of text.split('\n')) {
    const [k, v] = line.split('=');
    if (k && v) obj[k.trim()] = v.trim();
  }
  return obj;
}

async function handleIpInfo() {
  const r = await fetch('https://1.1.1.1/cdn-cgi/trace');
  const txt = await r.text();
  const data = parseTrace(txt);
  return new Response(JSON.stringify(data, null, 2), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export default async (request) => {
  const env = getEnv();
  const url = new URL(request.url);
  const pathname = url.pathname;
  const dohPath = `/${env.PATH}`;

  if (pathname === dohPath) {
    return handleDoH(request, env);
  }
  if (pathname === '/resolve') {
    return handleResolve(request, env);
  }
  if (pathname === '/ip') {
    const ip = pickClientIP(request.headers);
    return new Response(ip + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
  }
  if (pathname === '/ip-info') {
    return handleIpInfo();
  }

  return new Response(
    `OK (Netlify Edge DoH)\n\n` +
    `Binary DoH: ${dohPath}\n` +
    `JSON DoH: /resolve?name=example.com&type=A\n` +
    `IP: /ip\n` +
    `IP Info: /ip-info\n`,
    { headers: { 'content-type': 'text/plain; charset=utf-8' } }
  );
};

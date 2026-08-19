/**
 * Shared fetch-proxy used by both the Vite dev server and the production
 * Node server. Browsers can't fetch Canvas/Google Calendar directly (no CORS
 * headers on those endpoints), so every remote import goes through here.
 *
 * Routes:
 *   GET /api/fetch?url=<encoded>            -> passthrough for .ics feeds
 *   GET /api/canvas?host=&path=&token=      -> Canvas LMS REST API (paginated)
 */

const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
  /\.local$/i,
];

function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw.replace(/^webcal:\/\//i, 'https://'));
  } catch {
    throw new HttpError(400, 'Not a valid URL.');
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, 'Only http(s) URLs are allowed.');
  if (BLOCKED_HOSTS.some((re) => re.test(u.hostname))) {
    throw new HttpError(403, 'That host is not reachable from Station.');
  }
  return u;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function passthrough(url) {
  const target = assertPublicUrl(url);
  const res = await fetch(target, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Station/0.1 (+calendar-import)', Accept: 'text/calendar, text/plain, */*' },
  });
  const body = await res.text();
  if (!res.ok) throw new HttpError(res.status, `Source responded ${res.status}. ${body.slice(0, 200)}`);
  return { contentType: res.headers.get('content-type') || 'text/plain', body };
}

/** Follows RFC-5988 `Link: rel="next"` pagination that Canvas uses. */
async function canvas({ host, path, token, max = 5 }) {
  if (!token) throw new HttpError(400, 'Missing Canvas access token.');
  const clean = String(host || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
  let next = assertPublicUrl(`https://${clean}/api/v1/${String(path).replace(/^\/+/, '')}`).toString();
  const out = [];

  for (let page = 0; page < max && next; page++) {
    const res = await fetch(next, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(
        res.status,
        res.status === 401
          ? 'Canvas rejected that token. Generate a new one under Account -> Settings -> New Access Token.'
          : `Canvas responded ${res.status}. ${text.slice(0, 200)}`
      );
    }
    // Canvas prefixes some responses with a JSON-hijacking guard.
    const json = JSON.parse(text.replace(/^while\(1\);/, ''));
    out.push(...(Array.isArray(json) ? json : [json]));

    const link = res.headers.get('link') || '';
    const m = link.split(',').find((p) => /rel="next"/.test(p));
    next = m ? m.slice(m.indexOf('<') + 1, m.indexOf('>')) : null;
  }
  return out;
}

/** Node http handler. Returns true if it handled the request. */
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;

  const send = (status, payload, contentType = 'application/json') => {
    res.statusCode = status;
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  };

  try {
    if (url.pathname === '/api/fetch') {
      const { contentType, body } = await passthrough(url.searchParams.get('url') || '');
      return (send(200, body, contentType), true);
    }
    if (url.pathname === '/api/canvas') {
      const data = await canvas({
        host: url.searchParams.get('host'),
        path: url.searchParams.get('path'),
        token: url.searchParams.get('token') || (req.headers.authorization || '').replace(/^Bearer /, ''),
        max: Number(url.searchParams.get('max') || 5),
      });
      return (send(200, data), true);
    }
    return (send(404, { error: 'Unknown endpoint.' }), true);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 502;
    return (send(status, { error: err.message || 'Import failed.' }), true);
  }
}

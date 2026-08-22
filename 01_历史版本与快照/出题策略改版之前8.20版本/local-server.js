const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.QUIZ_SITE_PORT || 8765);
const ROOT = __dirname;
const UPSTREAM_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error('REQUEST_BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function proxyChatCompletion(request, response) {
  if (request.method !== 'POST') {
    sendJson(response, 405, { message: 'Method not allowed' });
    return;
  }
  const authorization = request.headers.authorization;
  if (!authorization) {
    sendJson(response, 401, { message: 'Missing Authorization header' });
    return;
  }

  try {
    const body = await readRequestBody(request);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 150000);
    let upstream;
    try {
      upstream = await fetch(UPSTREAM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authorization,
          'Accept': 'application/json'
        },
        body,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }

    const responseBody = Buffer.from(await upstream.arrayBuffer());
    response.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-SiliconCloud-Trace-Id': upstream.headers.get('x-siliconcloud-trace-id') || ''
    });
    response.end(responseBody);
  } catch (error) {
    const timeout = error?.name === 'AbortError';
    sendJson(response, timeout ? 504 : 502, {
      code: timeout ? 'LOCAL_PROXY_UPSTREAM_TIMEOUT' : 'LOCAL_PROXY_ERROR',
      message: timeout ? '本地代理等待硅基流动响应超时' : `本地代理请求失败：${error.message}`
    });
  }
}

function resolveStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const relative = decoded === '/' ? '趣味刷题小站第一版.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(ROOT, relative);
  const rootWithSeparator = `${path.resolve(ROOT)}${path.sep}`;
  if (resolved !== path.resolve(ROOT) && !resolved.startsWith(rootWithSeparator)) return null;
  return resolved;
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const filePath = resolveStaticPath(requestUrl.pathname);
  if (!filePath) {
    sendJson(response, 403, { message: 'Forbidden' });
    return;
  }
  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      sendJson(response, 404, { message: 'Not found' });
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': /\.(?:html|js)$/i.test(filePath) ? 'no-store' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  if (requestUrl.pathname === '/api/chat/completions') {
    proxyChatCompletion(request, response);
    return;
  }
  serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`趣味刷题小站已启动：http://${HOST}:${PORT}/趣味刷题小站第一版.html`);
});


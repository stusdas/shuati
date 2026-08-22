const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = Number(process.env.QUIZ_SITE_PORT || 8766);
const ROOT = __dirname;
const UPSTREAM_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const DATA_DIRECTORY = path.join(ROOT, '题库数据备份');
const STATE_FILE = path.join(DATA_DIRECTORY, '当前题库与学习记录.json');
const BACKUP_DIRECTORY = path.join(DATA_DIRECTORY, '自动备份');
let lastArchiveBackupAt = 0;

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
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600'
    });
    response.end();
    return;
  }
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
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function ensureDataDirectories() {
  fs.mkdirSync(BACKUP_DIRECTORY, { recursive: true });
}

function timestampForFile() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isValidStatePayload(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    && payload.state && typeof payload.state === 'object' && Array.isArray(payload.state.courses);
}

function listStateBackupFiles() {
  ensureDataDirectories();
  const candidates = [];
  if (fs.existsSync(STATE_FILE)) candidates.push({ id: 'current', filePath: STATE_FILE, label: '当前自动保存（最新）' });
  for (const entry of fs.readdirSync(BACKUP_DIRECTORY, { withFileTypes: true })) {
    if (entry.isFile() && /^题库自动备份_.*\.json$/u.test(entry.name)) {
      candidates.push({ id: entry.name, filePath: path.join(BACKUP_DIRECTORY, entry.name), label: `历史自动备份：${entry.name.replace(/^题库自动备份_|\.json$/gu, '')}` });
    }
  }
  return candidates.map(item => {
    const stat = fs.statSync(item.filePath);
    let payload = null;
    try { payload = JSON.parse(fs.readFileSync(item.filePath, 'utf8')); } catch { /* 仍列出损坏文件，供用户知晓 */ }
    const courses = payload?.state?.courses || [];
    const questionCount = courses.reduce((total, course) => total + (course.question_bank?.length || 0), 0);
    return {
      id: item.id,
      label: item.label,
      saved_at: payload?.saved_at || stat.mtime.toISOString(),
      course_count: courses.length,
      question_count: questionCount,
      valid: isValidStatePayload(payload)
    };
  }).sort((left, right) => String(right.saved_at).localeCompare(String(left.saved_at)));
}

function sendState(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  response.end(JSON.stringify(payload));
}

async function handleStatePersistence(request, response) {
  if (request.method === 'OPTIONS') {
    sendState(response, 204, {});
    return;
  }
  if (request.method === 'GET') {
    if (!fs.existsSync(STATE_FILE)) {
      sendState(response, 404, { code: 'STATE_NOT_FOUND' });
      return;
    }
    try {
      sendState(response, 200, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
    } catch (error) {
      sendState(response, 500, { code: 'STATE_READ_FAILED', message: error.message });
    }
    return;
  }
  if (request.method !== 'POST') {
    sendState(response, 405, { code: 'METHOD_NOT_ALLOWED' });
    return;
  }
  try {
    const raw = await readRequestBody(request);
    const payload = JSON.parse(raw.toString('utf8'));
    if (!isValidStatePayload(payload)) {
      sendState(response, 400, { code: 'INVALID_STATE_PAYLOAD', message: '备份内容不是有效的题库状态。' });
      return;
    }
    ensureDataDirectories();
    const serialized = JSON.stringify({
      format: 'quiz-site-quality-v2',
      saved_at: new Date().toISOString(),
      state: payload.state
    }, null, 2);
    // 当前状态每次都覆盖式原子保存；另每 5 分钟保留一个历史快照，避免生成期间写出成千上份大文件。
    if (fs.existsSync(STATE_FILE) && Date.now() - lastArchiveBackupAt >= 5 * 60 * 1000) {
      fs.copyFileSync(STATE_FILE, path.join(BACKUP_DIRECTORY, `题库自动备份_${timestampForFile()}.json`));
      lastArchiveBackupAt = Date.now();
    }
    const temporaryFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, serialized, 'utf8');
    fs.renameSync(temporaryFile, STATE_FILE);
    sendState(response, 200, { ok: true, saved_at: JSON.parse(serialized).saved_at });
  } catch (error) {
    sendState(response, 500, { code: 'STATE_SAVE_FAILED', message: error.message });
  }
}

async function handleStateRestore(request, response) {
  if (request.method !== 'POST') {
    sendState(response, 405, { code: 'METHOD_NOT_ALLOWED' });
    return;
  }
  try {
    const requestedId = JSON.parse((await readRequestBody(request)).toString('utf8')).id;
    const matching = listStateBackupFiles().find(item => item.id === requestedId);
    if (!matching) {
      sendState(response, 404, { code: 'BACKUP_NOT_FOUND', message: '指定备份不存在。' });
      return;
    }
    const source = requestedId === 'current'
      ? STATE_FILE
      : path.join(BACKUP_DIRECTORY, requestedId);
    const payload = JSON.parse(fs.readFileSync(source, 'utf8'));
    if (!isValidStatePayload(payload)) {
      sendState(response, 400, { code: 'INVALID_BACKUP', message: '该备份文件不完整，无法恢复。' });
      return;
    }
    if (requestedId !== 'current' && fs.existsSync(STATE_FILE)) {
      fs.copyFileSync(STATE_FILE, path.join(BACKUP_DIRECTORY, `题库自动备份_恢复前_${timestampForFile()}.json`));
    }
    fs.writeFileSync(`${STATE_FILE}.tmp`, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(`${STATE_FILE}.tmp`, STATE_FILE);
    sendState(response, 200, { ok: true, state: payload.state });
  } catch (error) {
    sendState(response, 500, { code: 'STATE_RESTORE_FAILED', message: error.message });
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
  if (requestUrl.pathname === '/api/state') {
    handleStatePersistence(request, response);
    return;
  }
  if (requestUrl.pathname === '/api/state/backups') {
    if (request.method !== 'GET') return sendState(response, 405, { code: 'METHOD_NOT_ALLOWED' });
    try { return sendState(response, 200, { backups: listStateBackupFiles() }); }
    catch (error) { return sendState(response, 500, { code: 'BACKUP_LIST_FAILED', message: error.message }); }
  }
  if (requestUrl.pathname === '/api/state/restore') {
    handleStateRestore(request, response);
    return;
  }
  serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`趣味刷题小站已启动：http://${HOST}:${PORT}/趣味刷题小站第一版.html`);
});

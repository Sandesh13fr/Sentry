// SENTRY REST API + static client. Built-ins only (node:http). createServer() takes injected deps for tests.
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { normalize, extname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SIM_VERSION, simulate } from './engine.js';
import { validateStrategy, validateSeed, resolveAttributes, createOpenRouterParser } from './parser.js';
import { fingerprint, canonical, sha256Hex } from './hash.js';
import { createJsonStore } from './store.js';
import { createChain } from './chain.js';

export const BODY_LIMIT = 10 * 1024;
const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};
const CSP = "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const DOWN_AI = async () => { throw new Error('AI service is down (demo switch)'); };

class HttpError extends Error { constructor(status, message, field) { super(message); this.status = status; this.field = field; } }

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer', 'cache-control': 'no-store', ...headers,
  });
  res.end(data);
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > BODY_LIMIT) { reject(new HttpError(413, 'Request body is too large (max 10 KB).', 'body')); req.resume(); return; }
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(new HttpError(413, 'Request body is too large (max 10 KB).', 'body')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolveBody({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0;
        resolveBody(v);
      } catch { reject(new HttpError(400, 'Request body must be a JSON object.', 'body')); }
    });
    req.on('error', () => reject(new HttpError(400, 'Could not read request body.', 'body')));
  });
}

async function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, { error: 'Bad path.' }); }
  if (rel.includes('\0')) return send(res, 400, { error: 'Bad path.' });
  if (rel === '/' || rel === '') rel = '/index.html';
  const full = resolve(PUBLIC_DIR, '.' + normalize(rel));
  if (!(full + sep).startsWith(resolve(PUBLIC_DIR) + sep) || full === resolve(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden.' });
  try {
    const s = await stat(full);
    if (!s.isFile()) throw 0;
    const body = await readFile(full);
    const type = TYPES[extname(full).toLowerCase()] || 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'no-cache' };
    if (type.startsWith('text/html')) headers['content-security-policy'] = CSP;
    send(res, 200, req.method === 'HEAD' ? '' : body, headers);
  } catch { send(res, 404, { error: 'Not found.' }); }
}

export function createServer({ store, ai = null, chain = createChain(), logger = console } = {}) {
  if (!store) throw new Error('createServer needs a store');

  async function createMatch(body) {
    const a = validateStrategy(body.strategyA, 'Fighter A strategy');
    if (a.error) throw new HttpError(400, a.error, 'strategyA');
    const b = validateStrategy(body.strategyB, 'Fighter B strategy');
    if (b.error) throw new HttpError(400, b.error, 'strategyB');
    const s = validateSeed(body.seed);
    if (s.error) throw new HttpError(400, s.error, 'seed');
    const seed = s.value ?? randomBytes(6).toString('hex');

    const warn = (err) => logger.warn?.(`[parser] AI failed, using local fallback: ${err.message}`);
    // Demo switch for the live presentation: behave exactly as if the AI service failed (TC-03).
    const useAi = body.demo?.aiDown === true ? DOWN_AI : ai;
    const [pa, pb] = await Promise.all([resolveAttributes(a.value, useAi, warn), resolveAttributes(b.value, useAi, warn)]);
    const result = simulate(pa.attributes, pb.attributes, seed);
    const record = {
      id: randomUUID(), createdAt: new Date().toISOString(),
      strategyA: a.value, strategyB: b.value,
      attrsA: pa.attributes, attrsB: pb.attributes,
      parserSource: { A: pa.source, B: pb.source },
      result, fingerprint: '', anchor: { status: 'not-requested' },
    };
    record.fingerprint = fingerprint(record);
    return store.save(record);
  }

  function verify(rec) {
    const versionMatches = rec.result?.version === SIM_VERSION;
    const rerun = simulate(rec.attrsA, rec.attrsB, rec.result.seed);
    const recomputedFingerprint = fingerprint({ ...rec, result: rerun });
    const storedNow = fingerprint(rec);
    const verified = versionMatches && recomputedFingerprint === rec.fingerprint && storedNow === rec.fingerprint;
    const out = { verified, versionMatches, storedFingerprint: rec.fingerprint, recomputedFingerprint };
    if (!versionMatches) out.note = `Saved with ${rec.result?.version}; this server runs ${SIM_VERSION}.`;
    else if (storedNow !== rec.fingerprint) out.note = 'The saved result no longer matches its own fingerprint. The record was changed.';
    else if (!verified) out.note = `Re-run differs from the saved result (saved winner ${rec.result.winner}, re-run winner ${rerun.winner}).`;
    return out;
  }

  function repeat(rec, runs = 100) {
    const ref = canonical(simulate(rec.attrsA, rec.attrsB, rec.result.seed));
    let identical = 0;
    for (let i = 0; i < runs; i++) if (canonical(simulate(rec.attrsA, rec.attrsB, rec.result.seed)) === ref) identical++;
    return { runs, identical, outcomeFingerprint: sha256Hex(ref) };
  }

  let anchoring = new Map(); // id -> in-flight promise, so double clicks don't send two txs
  async function anchor(rec, body = {}) {
    if (rec.anchor?.status === 'anchored') return rec;
    if (!anchoring.has(rec.id)) {
      anchoring.set(rec.id, (async () => {
        // Demo switch: behave exactly as if the testnet RPC were unreachable (TC-04).
        const a = body.demo?.rpcDown === true
          ? { status: 'unavailable', reason: 'Testnet RPC is down (demo switch).', at: new Date().toISOString() }
          : await chain.anchor(rec.fingerprint);
        return store.update(rec.id, { anchor: a });
      })().finally(() => anchoring.delete(rec.id)));
    }
    return anchoring.get(rec.id);
  }

  async function getOr404(id) {
    const rec = await store.get(id);
    if (!rec) throw new HttpError(404, 'Match not found.');
    return rec;
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (!p.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed.' });
      return serveStatic(req, res, p);
    }
    if (p === '/api/health' && req.method === 'GET') {
      return send(res, 200, { ok: true, simulationVersion: SIM_VERSION, aiConfigured: Boolean(ai), aiProvider: ai ? 'openrouter' : 'local', aiModel: ai?.model ?? null, chainConfigured: Boolean(chain.configured) });
    }
    if (p === '/api/matches') {
      if (req.method === 'POST') return send(res, 201, await createMatch(await readJson(req)));
      if (req.method === 'GET') return send(res, 200, { matches: await store.list({ q: url.searchParams.get('q') || '', limit: url.searchParams.get('limit') || 50 }) });
      throw new HttpError(405, 'Method not allowed.');
    }
    const m = p.match(/^\/api\/matches\/([0-9a-f-]{36})(?:\/(verify|repeat|anchor))?$/i);
    if (m) {
      const [, id, action] = m;
      if (!action && req.method === 'GET') return send(res, 200, await getOr404(id));
      if (action && req.method === 'POST') {
        const rec = await getOr404(id);
        if (action === 'verify') return send(res, 200, verify(rec));
        if (action === 'repeat') return send(res, 200, repeat(rec));
        return send(res, 200, await anchor(rec, await readJson(req)));
      }
      throw new HttpError(405, 'Method not allowed.');
    }
    if (/^\/api\/matches\/[^/]+(\/\w+)?$/.test(p)) throw new HttpError(404, 'Match not found.');
    throw new HttpError(404, 'Not found.');
  }

  return http.createServer(async (req, res) => {
    try { await handle(req, res); }
    catch (err) {
      if (err instanceof HttpError) return send(res, err.status, err.field ? { error: err.message, field: err.field } : { error: err.message });
      logger.error?.(`[server] ${req.method} ${req.url}: ${err?.message}`);
      if (!res.headersSent) send(res, 500, { error: 'Something went wrong on the server. Try again.' });
    }
  });
}

export function configFromEnv(env = process.env) {
  return {
    port: Number(env.PORT) || 3000,
    dataFile: env.DATA_FILE || 'data/matches.json',
    storeKind: env.STORE === 'sqlite' ? 'sqlite' : 'json',
    ai: createOpenRouterParser({ apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free' }),
    chain: createChain({ rpcUrl: env.MONAD_RPC_URL, privateKey: env.ANCHOR_PRIVATE_KEY, contractAddress: env.ANCHOR_CONTRACT_ADDRESS, explorerTxUrl: env.EXPLORER_TX_URL }),
  };
}

async function main() {
  const cfg = configFromEnv();
  let store;
  if (cfg.storeKind === 'sqlite') {
    const { createSqliteStore } = await import('./store-sqlite.js');
    store = createSqliteStore(cfg.dataFile.replace(/\.json$/, '.sqlite'));
  } else store = createJsonStore(cfg.dataFile);
  await store.init();
  const server = createServer({ store, ai: cfg.ai, chain: cfg.chain });
  server.listen(cfg.port, () => {
    console.log(`Sentry running at http://localhost:${cfg.port}`);
    console.log(`  engine ${SIM_VERSION} · parser ${cfg.ai ? 'OpenRouter (' + cfg.ai.model + ')' : 'local only'} · testnet ${cfg.chain.configured ? 'configured' : 'not configured'} · store ${store.kind}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => { console.error(`Failed to start: ${err.message}`); process.exit(1); });
}

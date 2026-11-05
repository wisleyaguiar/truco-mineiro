// Adaptador HTTP (Node req/res) para a API. Usado pela função da Vercel e pelo servidor de dev.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiHandler } from './api.ts';

const MAX_BODY = 32 * 1024;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

/**
 * Cria o handler Node. `getApi` devolve null quando o online não está configurado (sem chaves).
 * A Vercel pode reescrever /api/x para /api?__path=x; aceitamos os dois formatos.
 */
export function nodeHandler(getApi: () => ApiHandler | null) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const rewritten = url.searchParams.get('__path');
      url.searchParams.delete('__path');
      const path = rewritten !== null ? `/api/${rewritten}`.replace(/\/+$/, '') : url.pathname.replace(/\/+$/, '');
      const api = getApi();
      if (!api) return send(res, 503, { error: 'online_disabled', message: 'O modo online ainda não está configurado.' });
      let body: unknown = null;
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const raw = await readBody(req);
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            return send(res, 400, { error: 'invalid_json', message: 'JSON inválido.' });
          }
        }
      }
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : v;
      const r = await api({ method: req.method ?? 'GET', path, query: url.searchParams, headers, body });
      send(res, r.status, r.body);
    } catch (err) {
      if ((err as Error).message === 'too_large') return send(res, 413, { error: 'too_large', message: 'Requisição grande demais.' });
      console.error('Erro no handler', err);
      send(res, 500, { error: 'internal', message: 'Erro interno.' });
    }
  };
}

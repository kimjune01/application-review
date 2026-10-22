import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { WorkspaceStore } from './server/store';

function reviewApi(): Plugin {
  return {
    name: 'local-review-api',
    configureServer(server) {
      const store = new WorkspaceStore(fileURLToPath(new URL('./data/workspace.json', import.meta.url)));
      server.middlewares.use('/api', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        const send = (code: number, body: unknown) => { res.statusCode = code; res.end(JSON.stringify(body)); };
        try {
          if (req.method === 'GET' && req.url === '/workspace') return send(200, store.snapshot());
          if ((req.method === 'POST' && req.url === '/import') || (req.method === 'PUT' && req.url?.startsWith('/reviews/'))) {
            if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: 'Local origin required' });
            if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required' });
            const limit = req.url === '/import' ? 20 * 1024 * 1024 : 200000;
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > limit) return send(413, { error: 'Request too large' });
              chunks.push(Buffer.from(chunk));
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (req.url === '/import') {
              if (typeof body.csv !== 'string') return send(400, { error: 'CSV text required' });
              return send(200, store.importCsv(body.csv));
            }
            return send(200, store.update(decodeURIComponent(req.url!.slice('/reviews/'.length)), body));
          }
          send(404, { error: 'Not found' });
        } catch (error) { send(400, { error: error instanceof Error ? error.message : 'Request failed' }); }
      });
    },
  };
}
export default defineConfig({ plugins: [react(), reviewApi()], server: { port: 5173, strictPort: true, host: '127.0.0.1' } });

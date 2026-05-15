import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './env.ts';
import { projectsRouter } from './routes/projects.ts';
import { generateRouter } from './routes/generate.ts';
import { authRouter } from './routes/auth.ts';

const app = new Hono();

app.use('*', logger());
app.use('*', cors({ origin: '*' }));

app.get('/health', (c) => c.json({ ok: true, ts: Date.now() }));
app.route('/projects', projectsRouter);
app.route('/projects', generateRouter);
app.route('/projects', authRouter);

console.info(`server listening on :${env.port}`);

export default {
  port: env.port,
  fetch: app.fetch,
  idleTimeout: 240,
};

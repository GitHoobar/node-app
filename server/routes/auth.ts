import { Hono } from 'hono';
import { projects } from '../db.ts';
import { getSession, refreshCodex } from '../sessions.ts';
import { startDeviceLogin, isLoggedIn, stopDeviceLogin } from '../codex-auth.ts';
import { publish } from '../bus.ts';

export const authRouter = new Hono()
  .post('/:id/login/start', async (c) => {
    const id = c.req.param('id');
    if (!projects.get(id)) return c.json({ error: 'not_found' }, 404);
    try {
      const { sandbox } = await getSession(id);
      if (await isLoggedIn(sandbox)) return c.json({ status: 'logged_in' });
      const info = await startDeviceLogin(sandbox);
      publish(id, { kind: 'log', level: 'info', message: 'codex device-auth started' });
      return c.json({ status: 'pending', url: info.url, code: info.code });
    } catch (e) {
      return c.json({ error: String(e) }, 500);
    }
  })
  .get('/:id/login/status', async (c) => {
    const id = c.req.param('id');
    if (!projects.get(id)) return c.json({ error: 'not_found' }, 404);
    const { sandbox } = await getSession(id);
    const logged = await isLoggedIn(sandbox);
    if (logged) {
      await stopDeviceLogin(sandbox);
      await refreshCodex(id).catch((e) => publish(id, { kind: 'log', level: 'error', message: String(e) }));
    }
    return c.json({ loggedIn: logged });
  });

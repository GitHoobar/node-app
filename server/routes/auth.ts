import { Hono } from 'hono';
import { projects } from '../db.ts';
import { getSession, refreshLoginState } from '../sessions.ts';
import { startDeviceLogin, isLoggedIn, stopDeviceLogin } from '../codex-auth.ts';
import { isBootstrapDone } from '../sandbox.ts';
import { publish } from '../bus.ts';

type LoginStartResult = { status: 'logged_in' } | { status: 'pending'; url: string; code: string };

const LOGIN_START_CACHE_MS = 5000;
const loginStartRequests = new Map<string, Promise<LoginStartResult>>();

const scheduleLoginStartClear = (projectId: string, request: Promise<LoginStartResult>) => {
  setTimeout(() => {
    if (loginStartRequests.get(projectId) === request) {
      loginStartRequests.delete(projectId);
    }
  }, LOGIN_START_CACHE_MS);
};

const getOrStartDeviceLogin = (projectId: string): { request: Promise<LoginStartResult>; reused: boolean } => {
  const existing = loginStartRequests.get(projectId);
  if (existing) return { request: existing, reused: true };

  const request = (async (): Promise<LoginStartResult> => {
    const { sandbox } = await getSession(projectId);
    if (await isLoggedIn(sandbox)) return { status: 'logged_in' };
    const info = await startDeviceLogin(sandbox);
    return { status: 'pending', url: info.url, code: info.code };
  })();
  loginStartRequests.set(projectId, request);
  request.then(
    () => scheduleLoginStartClear(projectId, request),
    () => scheduleLoginStartClear(projectId, request),
  );
  return { request, reused: false };
};

export const authRouter = new Hono()
  .post('/:id/login/start', async (c) => {
    const id = c.req.param('id');
    if (!projects.get(id)) return c.json({ error: 'not_found' }, 404);
    if (!isBootstrapDone(id)) {
      getSession(id).catch((e) => publish(id, { kind: 'log', level: 'error', message: String(e) }));
      return c.json({ status: 'preparing' });
    }
    try {
      const { request, reused } = getOrStartDeviceLogin(id);
      const result = await request;
      if (!reused && result.status === 'pending') {
        publish(id, { kind: 'log', level: 'info', message: 'codex device-auth started' });
      }
      return c.json(result);
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
      await stopDeviceLogin(sandbox).catch(() => undefined);
      await refreshLoginState(id);
    }
    return c.json({ loggedIn: logged });
  });

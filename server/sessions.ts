import type { Sandbox } from 'e2b';
import { createSandboxForProject, connectSandbox, ensureBootstrapForProject, resetBootstrapForProject } from './sandbox.ts';
import { ensureDevServer } from './bootstrap.ts';
import { isLoggedIn } from './codex-auth.ts';
import { projects } from './db.ts';
import { publish } from './bus.ts';
import { restoreProjectFiles } from './project-files.ts';

type Session = {
  sandbox: Sandbox;
  loggedIn: boolean;
  previewUrl: string;
};

const sessions = new Map<string, Promise<Session>>();

const isMissingSandboxError = (error: unknown): boolean => {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'SandboxNotFoundError' || /sandbox .*not found|sandbox is probably not running anymore/i.test(message);
};

const assertSandboxAlive = async (session: Session): Promise<void> => {
  await session.sandbox.commands.run('true', { timeoutMs: 5000 });
};

const buildSession = async (projectId: string): Promise<Session> => {
  console.info(`[session ${projectId}] buildSession start`);
  const p = await projects.get(projectId);
  if (!p) throw new Error('project not found');
  console.info(`[session ${projectId}] project loaded, sandboxId=${p.sandboxId ?? 'null'}`);
  let sandboxWasReplaced = !p.sandboxId;
  const handles = p.sandboxId
    ? await connectSandbox(p.sandboxId).catch(async (e) => {
        console.warn(`[session ${projectId}] connect failed (${String(e)}), creating fresh`);
        resetBootstrapForProject(projectId);
        sandboxWasReplaced = true;
        const fresh = await createSandboxForProject();
        await projects.setSandboxId(p.id, fresh.sandbox.sandboxId);
        await projects.setThreadId(p.id, null);
        return fresh;
      })
    : await createSandboxForProject();
  console.info(`[session ${projectId}] sandbox ready: ${handles.sandbox.sandboxId}, preview=${handles.previewUrl}`);

  if (handles.sandbox.sandboxId !== p.sandboxId) {
    sandboxWasReplaced = true;
    resetBootstrapForProject(projectId);
    await projects.setSandboxId(p.id, handles.sandbox.sandboxId);
    await projects.setThreadId(p.id, null);
  }
  if (handles.previewUrl !== p.previewUrl) {
    await projects.setPreviewUrl(p.id, handles.previewUrl);
    publish(p.id, { kind: 'preview.url', url: handles.previewUrl });
  }

  console.info(`[session ${projectId}] ensureBootstrap start`);
  try {
    await ensureBootstrapForProject(handles.sandbox, p.id);
    if (sandboxWasReplaced) {
      const restored = await restoreProjectFiles(handles.sandbox, p.id, (line) =>
        publish(projectId, { kind: 'log', level: 'info', message: line }),
      );
      if (restored) {
        await ensureDevServer(handles.sandbox, (line) => publish(projectId, { kind: 'log', level: 'info', message: line }));
      }
    }
    console.info(`[session ${projectId}] ensureBootstrap done`);
  } catch (e) {
    console.error(`[session ${projectId}] bootstrap FAILED:`, e);
    throw e;
  }

  const loggedIn = await isLoggedIn(handles.sandbox);
  console.info(`[session ${projectId}] codex loggedIn=${loggedIn}`);
  return { sandbox: handles.sandbox, loggedIn, previewUrl: handles.previewUrl };
};

export const getSession = async (projectId: string): Promise<Session> => {
  const cached = sessions.get(projectId);
  if (cached) {
    try {
      const session = await cached;
      await assertSandboxAlive(session);
      return session;
    } catch (error) {
      if (!isMissingSandboxError(error)) throw error;
      console.warn(`[session ${projectId}] cached sandbox is gone (${String(error)}), rebuilding`);
      sessions.delete(projectId);
      resetBootstrapForProject(projectId);
    }
  }

  const s = buildSession(projectId);
  sessions.set(projectId, s);
  s.catch(() => sessions.delete(projectId));
  return s;
};

export const refreshLoginState = async (projectId: string): Promise<boolean> => {
  const cached = sessions.get(projectId);
  if (!cached) return false;
  const session = await cached;
  session.loggedIn = await isLoggedIn(session.sandbox);
  return session.loggedIn;
};

export const closeSession = async (projectId: string): Promise<void> => {
  sessions.delete(projectId);
};

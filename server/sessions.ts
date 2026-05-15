import type { Sandbox } from 'e2b';
import { CodexClient } from './codex.ts';
import { createSandboxForProject, connectSandbox, ensureCodexAppServer, ensureBootstrapForProject } from './sandbox.ts';
import { isLoggedIn } from './codex-auth.ts';
import { projects } from './db.ts';
import { publish } from './bus.ts';

type Session = {
  sandbox: Sandbox;
  codex: CodexClient | null;
  previewUrl: string;
  codexWsUrl: string;
};

const sessions = new Map<string, Promise<Session>>();

const buildSession = async (projectId: string): Promise<Session> => {
  console.info(`[session ${projectId}] buildSession start`);
  const p = projects.get(projectId);
  if (!p) throw new Error('project not found');
  console.info(`[session ${projectId}] project loaded, sandboxId=${p.sandboxId ?? 'null'}`);
  const handles = p.sandboxId
    ? await connectSandbox(p.sandboxId).catch(async (e) => {
        console.warn(`[session ${projectId}] connect failed (${String(e)}), creating fresh`);
        const fresh = await createSandboxForProject();
        projects.setSandboxId(p.id, fresh.sandbox.sandboxId);
        return fresh;
      })
    : await createSandboxForProject();
  console.info(`[session ${projectId}] sandbox ready: ${handles.sandbox.sandboxId}, preview=${handles.previewUrl}`);

  if (handles.sandbox.sandboxId !== p.sandboxId) {
    projects.setSandboxId(p.id, handles.sandbox.sandboxId);
  }
  if (handles.previewUrl !== p.previewUrl) {
    projects.setPreviewUrl(p.id, handles.previewUrl);
    publish(p.id, { kind: 'preview.url', url: handles.previewUrl });
  }

  console.info(`[session ${projectId}] ensureBootstrap start`);
  try {
    await ensureBootstrapForProject(handles.sandbox, p.id);
    console.info(`[session ${projectId}] ensureBootstrap done`);
  } catch (e) {
    console.error(`[session ${projectId}] bootstrap FAILED:`, e);
    throw e;
  }

  let codex: CodexClient | null = null;
  if (await isLoggedIn(handles.sandbox)) {
    console.info(`[session ${projectId}] codex already logged in, starting app-server`);
    await ensureCodexAppServer(handles.sandbox, p.capabilityToken);
    codex = await CodexClient.connect(handles.codexWsUrl, p.capabilityToken);
    codex.onEvent((event) => publish(p.id, { kind: 'codex', event }));
  } else {
    console.info(`[session ${projectId}] codex not yet logged in`);
  }

  return { sandbox: handles.sandbox, codex, previewUrl: handles.previewUrl, codexWsUrl: handles.codexWsUrl };
};

export const getSession = (projectId: string): Promise<Session> => {
  let s = sessions.get(projectId);
  if (!s) {
    s = buildSession(projectId);
    sessions.set(projectId, s);
    s.catch(() => sessions.delete(projectId));
  }
  return s;
};

export const refreshCodex = async (projectId: string): Promise<void> => {
  const cached = sessions.get(projectId);
  if (!cached) return;
  const session = await cached;
  if (session.codex) return;
  const p = projects.get(projectId);
  if (!p) return;
  await ensureCodexAppServer(session.sandbox, p.capabilityToken);
  const codex = await CodexClient.connect(session.codexWsUrl, p.capabilityToken);
  codex.onEvent((event) => publish(projectId, { kind: 'codex', event }));
  session.codex = codex;
};

export const closeSession = async (projectId: string): Promise<void> => {
  const s = sessions.get(projectId);
  if (!s) return;
  sessions.delete(projectId);
  const session = await s.catch(() => null);
  session?.codex?.close();
};

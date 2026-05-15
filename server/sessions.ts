import type { Sandbox } from 'e2b';
import { CodexClient } from './codex.ts';
import { createSandboxForProject, connectSandbox } from './sandbox.ts';
import { projects } from './db.ts';
import { publish } from './bus.ts';

type Session = {
  sandbox: Sandbox;
  codex: CodexClient;
  previewUrl: string;
  codexWsUrl: string;
};

const sessions = new Map<string, Promise<Session>>();

const buildSession = async (projectId: string): Promise<Session> => {
  const p = projects.get(projectId);
  if (!p) throw new Error('project not found');
  const handles = p.sandboxId
    ? await connectSandbox(p.sandboxId, p.capabilityToken).catch(async () => {
        const fresh = await createSandboxForProject(p.capabilityToken);
        projects.setSandboxId(p.id, fresh.sandbox.sandboxId);
        return fresh;
      })
    : await createSandboxForProject(p.capabilityToken);

  if (handles.sandbox.sandboxId !== p.sandboxId) {
    projects.setSandboxId(p.id, handles.sandbox.sandboxId);
  }
  if (handles.previewUrl !== p.previewUrl) {
    projects.setPreviewUrl(p.id, handles.previewUrl);
    publish(p.id, { kind: 'preview.url', url: handles.previewUrl });
  }

  const codex = await CodexClient.connect(handles.codexWsUrl, p.capabilityToken);
  codex.onEvent((event) => publish(p.id, { kind: 'codex', event }));

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

export const closeSession = async (projectId: string): Promise<void> => {
  const s = sessions.get(projectId);
  if (!s) return;
  sessions.delete(projectId);
  const session = await s.catch(() => null);
  session?.codex.close();
};

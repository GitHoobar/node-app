import type { Project, ServerSentEvent, TreeNode } from '@shared/types';

const apiPath = (path: string) => `/api${path}`;

export const listProjects = (): Promise<Project[]> => fetch(apiPath('/projects')).then((r) => r.json());

export const createProject = (name: string): Promise<Project> =>
  fetch(apiPath('/projects'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((r) => r.json());

export const getProject = (id: string): Promise<Project> => fetch(apiPath(`/projects/${id}`)).then((r) => r.json());

export const patchTree = (id: string, tree: TreeNode): Promise<unknown> =>
  fetch(apiPath(`/projects/${id}/tree`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tree }),
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof body.error === 'string' ? body.error : 'failed_to_save_tree');
    return body;
  });

export type GenerateResponse = { ok: true; skipped?: boolean };

export const generate = (id: string): Promise<GenerateResponse> =>
  fetch(apiPath(`/projects/${id}/generate`), { method: 'POST' }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof body.error === 'string' ? body.error : 'failed_to_generate');
    return body as GenerateResponse;
  });

export const sendCodexInstruction = (id: string, message: string): Promise<{ ok: true }> =>
  fetch(apiPath(`/projects/${id}/chat`), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof body.error === 'string' ? body.error : 'failed_to_send_instruction');
    return body as { ok: true };
  });

export type LoginStartResponse =
  | { status: 'logged_in' }
  | { status: 'preparing' }
  | { status: 'pending'; url: string; code: string }
  | { error: string };

export const startLogin = (id: string): Promise<LoginStartResponse> =>
  fetch(apiPath(`/projects/${id}/login/start`), { method: 'POST' }).then((r) => r.json());

export const getLoginStatus = (id: string): Promise<{ loggedIn: boolean }> =>
  fetch(apiPath(`/projects/${id}/login/status`)).then((r) => r.json());

export const getPreviewReady = (id: string): Promise<{ ready: boolean }> =>
  fetch(apiPath(`/projects/${id}/preview/ready`)).then((r) => r.json()).catch(() => ({ ready: false }));

export const openStream = (id: string, onEvent: (sse: ServerSentEvent) => void): EventSource => {
  const es = new EventSource(apiPath(`/projects/${id}/stream`));
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as ServerSentEvent);
    } catch {}
  };
  return es;
};

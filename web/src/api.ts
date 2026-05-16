import type { Project, ServerSentEvent, TreeNode } from '@shared/types';

export const listProjects = (): Promise<Project[]> => fetch('/projects').then((r) => r.json());

export const createProject = (name: string): Promise<Project> =>
  fetch('/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }).then(
    (r) => r.json(),
  );

export const getProject = (id: string): Promise<Project> => fetch(`/projects/${id}`).then((r) => r.json());

export const patchTree = (id: string, tree: TreeNode): Promise<unknown> =>
  fetch(`/projects/${id}/tree`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tree }),
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof body.error === 'string' ? body.error : 'failed_to_save_tree');
    return body;
  });

export const generate = (id: string): Promise<unknown> =>
  fetch(`/projects/${id}/generate`, { method: 'POST' }).then((r) => r.json());

export type LoginStartResponse =
  | { status: 'logged_in' }
  | { status: 'preparing' }
  | { status: 'pending'; url: string; code: string }
  | { error: string };

export const startLogin = (id: string): Promise<LoginStartResponse> =>
  fetch(`/projects/${id}/login/start`, { method: 'POST' }).then((r) => r.json());

export const getLoginStatus = (id: string): Promise<{ loggedIn: boolean }> =>
  fetch(`/projects/${id}/login/status`).then((r) => r.json());

export const getPreviewReady = (id: string): Promise<{ ready: boolean }> =>
  fetch(`/projects/${id}/preview/ready`).then((r) => r.json()).catch(() => ({ ready: false }));

export const openStream = (id: string, onEvent: (sse: ServerSentEvent) => void): EventSource => {
  const es = new EventSource(`/projects/${id}/stream`);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as ServerSentEvent);
    } catch {}
  };
  return es;
};

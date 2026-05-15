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
  }).then((r) => r.json());

export const generate = (id: string): Promise<unknown> =>
  fetch(`/projects/${id}/generate`, { method: 'POST' }).then((r) => r.json());

export const openStream = (id: string, onEvent: (sse: ServerSentEvent) => void): EventSource => {
  const es = new EventSource(`/projects/${id}/stream`);
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data) as ServerSentEvent);
    } catch {}
  };
  return es;
};

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import type { Project, TreeNode } from '@shared/types';
import { APP_ROOT_NAME, ROOT_NODE_ID } from '@shared/types';
import type { Database } from 'bun:sqlite';

const fullTree: TreeNode = {
  id: ROOT_NODE_ID,
  name: APP_ROOT_NAME,
  prompt: '',
  children: [
    { id: 'keep', name: 'Keep', prompt: 'keep', children: [] },
    {
      id: 'delete-me',
      name: 'Delete me',
      prompt: 'delete',
      children: [{ id: 'delete-child', name: 'Delete child', prompt: 'delete child', children: [] }],
    },
  ],
};

const prunedTree: TreeNode = {
  ...fullTree,
  children: [{ id: 'keep', name: 'Keep', prompt: 'keep', children: [] }],
};

let tmp: string;
let app: Hono;
let db: Database;
const realFetch = globalThis.fetch;

const jsonRequest = (path: string, method: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const createProject = async (): Promise<Project> => {
  const response = await jsonRequest('/projects', 'POST', { name: 'Test Project' });
  expect(response.status).toBe(200);
  return response.json() as Promise<Project>;
};

beforeAll(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'node-app-projects-'));
  process.env.E2B_API_KEY = 'test-key';
  process.env.DATABASE_PATH = join(tmp, 'test.db');

  const dbModule = await import('../db.ts');
  const { projectsRouter } = await import('./projects.ts');
  db = dbModule.db;
  app = new Hono().route('/projects', projectsRouter);
});

afterAll(() => {
  globalThis.fetch = realFetch;
  db.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe('project tree persistence', () => {
  test('lists multiple persisted project sandbox records', async () => {
    const first = await createProject();
    const second = await createProject();
    const dbModule = await import('../db.ts');
    dbModule.projects.setSandboxId(first.id, 'sandbox-one');
    dbModule.projects.setPreviewUrl(first.id, 'https://one.example');
    dbModule.projects.setSandboxId(second.id, 'sandbox-two');
    dbModule.projects.setPreviewUrl(second.id, 'https://two.example');

    const response = await jsonRequest('/projects', 'GET');
    const list = (await response.json()) as Project[];

    expect(list.find((project) => project.id === first.id)?.sandboxId).toBe('sandbox-one');
    expect(list.find((project) => project.id === second.id)?.sandboxId).toBe('sandbox-two');
  });

  test('creates projects with an App root instead of a Home page root', async () => {
    const project = await createProject();

    expect(project.tree.name).toBe(APP_ROOT_NAME);
    expect(project.tree.children).toEqual([]);
  });

  test('persists a saved deletion across a fresh project fetch', async () => {
    const project = await createProject();

    expect((await jsonRequest(`/projects/${project.id}/tree`, 'PATCH', { tree: fullTree })).status).toBe(200);
    expect((await jsonRequest(`/projects/${project.id}/tree`, 'PATCH', { tree: prunedTree })).status).toBe(200);

    const reload = await jsonRequest(`/projects/${project.id}`, 'GET');
    const saved = (await reload.json()) as Project;

    expect(saved.tree).toEqual(prunedTree);
    expect(JSON.stringify(saved.tree)).not.toContain('delete-me');
    expect(JSON.stringify(saved.tree)).not.toContain('delete-child');
  });

  test('rejects invalid tree payloads', async () => {
    const project = await createProject();

    const response = await jsonRequest(`/projects/${project.id}/tree`, 'PATCH', { tree: { id: ROOT_NODE_ID } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_tree' });
  });

  test('returns not_found for valid saves to missing projects', async () => {
    const response = await jsonRequest('/projects/missing/tree', 'PATCH', { tree: prunedTree });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not_found' });
  });
});

describe('project preview readiness', () => {
  test('treats reachable app errors as preview-ready so the iframe can show them', async () => {
    const project = await createProject();
    const dbModule = await import('../db.ts');
    dbModule.projects.setPreviewUrl(project.id, 'https://preview.example');
    globalThis.fetch = (() => Promise.resolve(new Response('Internal Server Error', { status: 500 }))) as unknown as typeof fetch;

    const response = await jsonRequest(`/projects/${project.id}/preview/ready`, 'GET');

    expect(await response.json()).toEqual({ ready: true });
  });

  test('keeps waiting while E2B reports a closed preview port', async () => {
    const project = await createProject();
    const dbModule = await import('../db.ts');
    dbModule.projects.setPreviewUrl(project.id, 'https://preview.example');
    globalThis.fetch = (() => Promise.resolve(new Response('<h1>Closed Port Error</h1>', { status: 502 }))) as unknown as typeof fetch;

    const response = await jsonRequest(`/projects/${project.id}/preview/ready`, 'GET');

    expect(await response.json()).toEqual({ ready: false });
  });

  test('keeps waiting while E2B reports the preview port is not open', async () => {
    const project = await createProject();
    const dbModule = await import('../db.ts');
    dbModule.projects.setPreviewUrl(project.id, 'https://preview.example');
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json(
          { sandboxId: 'booting', message: 'The sandbox is running but port is not open', port: 3000, code: 502 },
          { status: 502 },
        ),
      )) as unknown as typeof fetch;

    const response = await jsonRequest(`/projects/${project.id}/preview/ready`, 'GET');

    expect(await response.json()).toEqual({ ready: false });
  });

  test('keeps waiting while E2B reports the sandbox is gone', async () => {
    const project = await createProject();
    const dbModule = await import('../db.ts');
    dbModule.projects.setPreviewUrl(project.id, 'https://preview.example');
    globalThis.fetch = (() =>
      Promise.resolve(
        Response.json({ sandboxId: 'stale', message: 'The sandbox was not found', code: 502 }, { status: 502 }),
      )) as unknown as typeof fetch;

    const response = await jsonRequest(`/projects/${project.id}/preview/ready`, 'GET');

    expect(await response.json()).toEqual({ ready: false });
  });
});

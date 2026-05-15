import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from './env.ts';
import type { Project, TreeNode } from '@shared/types';
import { emptyTree } from '@shared/types';

mkdirSync(dirname(env.databasePath), { recursive: true });
export const db = new Database(env.databasePath, { create: true });
db.exec('PRAGMA journal_mode = WAL;');
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    sandbox_id      TEXT NOT NULL,
    codex_thread_id TEXT,
    capability_token TEXT NOT NULL,
    tree_json       TEXT NOT NULL,
    preview_url     TEXT,
    updated_at      INTEGER NOT NULL
  );
`);

type Row = {
  id: string;
  name: string;
  sandbox_id: string;
  codex_thread_id: string | null;
  capability_token: string;
  tree_json: string;
  preview_url: string | null;
  updated_at: number;
};

const toProject = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  sandboxId: r.sandbox_id,
  codexThreadId: r.codex_thread_id,
  capabilityToken: r.capability_token,
  tree: JSON.parse(r.tree_json) as TreeNode,
  previewUrl: r.preview_url,
  updatedAt: r.updated_at,
});

export const projects = {
  list(): Project[] {
    return (db.query('SELECT * FROM projects ORDER BY updated_at DESC').all() as Row[]).map(toProject);
  },
  get(id: string): Project | null {
    const r = db.query('SELECT * FROM projects WHERE id = ?').get(id) as Row | null;
    return r ? toProject(r) : null;
  },
  insert(p: Project): void {
    db.run(
      'INSERT INTO projects (id, name, sandbox_id, codex_thread_id, capability_token, tree_json, preview_url, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [p.id, p.name, p.sandboxId, p.codexThreadId, p.capabilityToken, JSON.stringify(p.tree), p.previewUrl, p.updatedAt],
    );
  },
  updateTree(id: string, tree: TreeNode): void {
    db.run('UPDATE projects SET tree_json = ?, updated_at = ? WHERE id = ?', [JSON.stringify(tree), Date.now(), id]);
  },
  setThreadId(id: string, threadId: string): void {
    db.run('UPDATE projects SET codex_thread_id = ?, updated_at = ? WHERE id = ?', [threadId, Date.now(), id]);
  },
  setPreviewUrl(id: string, url: string): void {
    db.run('UPDATE projects SET preview_url = ?, updated_at = ? WHERE id = ?', [url, Date.now(), id]);
  },
  setSandboxId(id: string, sandboxId: string): void {
    db.run('UPDATE projects SET sandbox_id = ?, updated_at = ? WHERE id = ?', [sandboxId, Date.now(), id]);
  },
};

export { emptyTree };

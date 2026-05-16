import postgres from 'postgres';
import { env } from './env.ts';
import type { Project, TreeNode } from '@shared/types';
import { emptyTree, normalizeAppRoot } from '@shared/types';

export const sql = postgres(env.databaseUrl, { max: 5, onnotice: () => undefined });

let schemaReady: Promise<void> | null = null;

export const ensureDb = (): Promise<void> => {
  schemaReady ??= (async () => {
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sandbox_id TEXT,
        codex_thread_id TEXT,
        capability_token TEXT NOT NULL,
        tree_json JSONB NOT NULL,
        last_generated_tree_json JSONB,
        preview_url TEXT,
        updated_at BIGINT NOT NULL
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS project_file_archives (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        archive BYTEA NOT NULL,
        archive_sha256 TEXT NOT NULL,
        archive_bytes INTEGER NOT NULL,
        file_count INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `;
  })();

  return schemaReady;
};

export const closeDb = async (): Promise<void> => {
  schemaReady = null;
  await sql.end({ timeout: 1 });
};

type JsonValue = TreeNode | string;

type Row = {
  id: string;
  name: string;
  sandbox_id: string | null;
  codex_thread_id: string | null;
  capability_token: string;
  tree_json: JsonValue;
  last_generated_tree_json: JsonValue | null;
  preview_url: string | null;
  updated_at: number | string;
};

const treeFromJson = (value: JsonValue): TreeNode =>
  normalizeAppRoot(typeof value === 'string' ? (JSON.parse(value) as TreeNode) : value);

const toProject = (r: Row): Project => ({
  id: r.id,
  name: r.name,
  sandboxId: r.sandbox_id,
  codexThreadId: r.codex_thread_id,
  capabilityToken: r.capability_token,
  tree: treeFromJson(r.tree_json),
  previewUrl: r.preview_url,
  updatedAt: Number(r.updated_at),
});

export const projects = {
  async list(): Promise<Project[]> {
    await ensureDb();
    const rows = await sql<Row[]>`SELECT * FROM projects ORDER BY updated_at DESC`;
    return rows.map(toProject);
  },
  async get(id: string): Promise<Project | null> {
    await ensureDb();
    const rows = await sql<Row[]>`SELECT * FROM projects WHERE id = ${id}`;
    return rows[0] ? toProject(rows[0]) : null;
  },
  async getLastGeneratedTree(id: string): Promise<TreeNode | null> {
    await ensureDb();
    const rows = await sql<Array<Pick<Row, 'last_generated_tree_json'>>>`
      SELECT last_generated_tree_json FROM projects WHERE id = ${id}
    `;
    const value = rows[0]?.last_generated_tree_json;
    return value ? treeFromJson(value) : null;
  },
  async insert(p: Project): Promise<void> {
    await ensureDb();
    const tree = normalizeAppRoot(p.tree);
    await sql`
      INSERT INTO projects (
        id,
        name,
        sandbox_id,
        codex_thread_id,
        capability_token,
        tree_json,
        last_generated_tree_json,
        preview_url,
        updated_at
      )
      VALUES (
        ${p.id},
        ${p.name},
        ${p.sandboxId},
        ${p.codexThreadId},
        ${p.capabilityToken},
        ${sql.json(tree)},
        ${null},
        ${p.previewUrl},
        ${p.updatedAt}
      )
    `;
  },
  async updateTree(id: string, tree: TreeNode): Promise<void> {
    await ensureDb();
    await sql`
      UPDATE projects
      SET tree_json = ${sql.json(normalizeAppRoot(tree))}, updated_at = ${Date.now()}
      WHERE id = ${id}
    `;
  },
  async setLastGeneratedTree(id: string, tree: TreeNode): Promise<void> {
    await ensureDb();
    await sql`
      UPDATE projects
      SET last_generated_tree_json = ${sql.json(normalizeAppRoot(tree))}, updated_at = ${Date.now()}
      WHERE id = ${id}
    `;
  },
  async setThreadId(id: string, threadId: string | null): Promise<void> {
    await ensureDb();
    await sql`UPDATE projects SET codex_thread_id = ${threadId}, updated_at = ${Date.now()} WHERE id = ${id}`;
  },
  async setPreviewUrl(id: string, url: string): Promise<void> {
    await ensureDb();
    await sql`UPDATE projects SET preview_url = ${url}, updated_at = ${Date.now()} WHERE id = ${id}`;
  },
  async setSandboxId(id: string, sandboxId: string): Promise<void> {
    await ensureDb();
    await sql`UPDATE projects SET sandbox_id = ${sandboxId}, updated_at = ${Date.now()} WHERE id = ${id}`;
  },
};

export { emptyTree };

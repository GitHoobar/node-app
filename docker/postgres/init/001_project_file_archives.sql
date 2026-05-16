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
);

CREATE TABLE IF NOT EXISTS project_file_archives (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  archive BYTEA NOT NULL,
  archive_sha256 TEXT NOT NULL,
  archive_bytes INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

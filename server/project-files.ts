import type { Sandbox } from 'e2b';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { ensureDb, sql } from './db.ts';

const PROJECT_ROOT = '/home/user';
const ARCHIVE_PATH = '/tmp/node-app-project-files.tgz';

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

const EXCLUDED_PATHS = [
  './node_modules',
  './.next',
  './.git',
  './.bun',
  './.npm',
  './.cache',
  './.config',
  './.codex',
  './.ssh',
];

const tarExcludeArgs = EXCLUDED_PATHS.map((path) => `--exclude=${shellQuote(path)}`).join(' ');
const findPruneArgs = EXCLUDED_PATHS.map((path) => `-path ${shellQuote(path)}`).join(' -o ');

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const sliced = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return sliced instanceof ArrayBuffer ? sliced : Buffer.from(bytes).buffer;
};

const createArchiveScript = (): string => `
set -eu
cd ${shellQuote(PROJECT_ROOT)}
rm -f ${shellQuote(ARCHIVE_PATH)}
tar ${tarExcludeArgs} -czf ${shellQuote(ARCHIVE_PATH)} .
find . \\( ${findPruneArgs} \\) -prune -o -type f -print | wc -l
`;

const restoreArchiveScript = (): string => `
set -eu
cd ${shellQuote(PROJECT_ROOT)}
for entry in $(ls -A1 ${shellQuote(PROJECT_ROOT)}); do
  case "$entry" in
    .bun|.npm|.config|.cache|.bashrc|.bash_logout|.profile) ;;
    *) rm -rf "${PROJECT_ROOT}/$entry" ;;
  esac
done
tar -xzf ${shellQuote(ARCHIVE_PATH)} -C ${shellQuote(PROJECT_ROOT)}
if [ -f package.json ]; then
  export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
  npm install --no-audit --no-fund --omit=optional --loglevel=error
fi
ss -ltnp 'sport = :3000' | sed -n 's/.*pid=\\([0-9][0-9]*\\).*/\\1/p' | sort -u | xargs -r kill
rm -rf ${shellQuote(`${PROJECT_ROOT}/.next`)} /tmp/next-dev.log
`;

type ArchiveRow = {
  archive: Buffer;
  archive_sha256: string;
  archive_bytes: number;
  file_count: number;
  updated_at: Date;
};

export const snapshotProjectFiles = async (
  sandbox: Sandbox,
  projectId: string,
  onLog: (line: string) => void,
): Promise<void> => {
  onLog('persisting project files to Postgres');
  await ensureDb();

  const countResult = await sandbox.commands.run(`bash -lc ${shellQuote(createArchiveScript())}`, { timeoutMs: 120_000 });
  const fileCount = Number(countResult.stdout.trim()) || 0;
  const archive = await sandbox.files.read(ARCHIVE_PATH, { format: 'bytes', requestTimeoutMs: 120_000 });
  const archiveBuffer = Buffer.from(archive);
  const archiveSha256 = createHash('sha256').update(archiveBuffer).digest('hex');

  await sql`
    INSERT INTO project_file_archives (project_id, archive, archive_sha256, archive_bytes, file_count, updated_at)
    VALUES (${projectId}, ${archiveBuffer}, ${archiveSha256}, ${archiveBuffer.byteLength}, ${fileCount}, now())
    ON CONFLICT (project_id) DO UPDATE SET
      archive = EXCLUDED.archive,
      archive_sha256 = EXCLUDED.archive_sha256,
      archive_bytes = EXCLUDED.archive_bytes,
      file_count = EXCLUDED.file_count,
      updated_at = now()
  `;

  onLog(`saved ${fileCount} project files to Postgres`);
};

export const restoreProjectFiles = async (
  sandbox: Sandbox,
  projectId: string,
  onLog: (line: string) => void,
): Promise<boolean> => {
  await ensureDb();
  const rows = await sql<ArchiveRow[]>`
    SELECT archive, archive_sha256, archive_bytes, file_count, updated_at
    FROM project_file_archives
    WHERE project_id = ${projectId}
  `;
  const row = rows[0];
  if (!row) return false;

  const archive = Buffer.from(row.archive);
  const archiveSha256 = createHash('sha256').update(archive).digest('hex');
  if (archiveSha256 !== row.archive_sha256) {
    throw new Error(`stored project archive checksum mismatch for project ${projectId}`);
  }

  onLog(`restoring ${row.file_count} project files from Postgres`);
  await sandbox.commands.run(`bash -c "rm -f ${shellQuote(ARCHIVE_PATH)}"`);
  await sandbox.files.write(ARCHIVE_PATH, toArrayBuffer(archive), { useOctetStream: true, requestTimeoutMs: 120_000 });
  await sandbox.commands.run(`bash -lc ${shellQuote(restoreArchiveScript())}`, { timeoutMs: 5 * 60_000 });
  onLog('restored project files from Postgres');
  return true;
};

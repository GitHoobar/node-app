import { Sandbox } from 'e2b';
import { env } from './env.ts';
import { isLoggedIn } from './codex-auth.ts';
import { ensureBootstrapped } from './bootstrap.ts';
import { publish } from './bus.ts';

const CODEX_PORT = 4500;
const PREVIEW_PORT = 3000;
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;

export type SandboxHandles = {
  sandbox: Sandbox;
  previewUrl: string;
  codexWsUrl: string;
};

export const ensureCodexAppServer = async (sandbox: Sandbox, token: string): Promise<void> => {
  if (!(await isLoggedIn(sandbox))) {
    throw new Error('codex_not_authenticated');
  }
  await sandbox.commands.run(
    `pgrep -f 'codex app-server' > /dev/null || nohup codex app-server --listen ws://0.0.0.0:${CODEX_PORT} > /tmp/codex-app-server.log 2>&1 &`,
    {
      background: true,
      envs: { CODEX_APP_SERVER_TOKEN: token },
    },
  );
  await waitForPort(sandbox, CODEX_PORT, 30_000);
};

const waitForPort = async (sandbox: Sandbox, port: number, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await sandbox.commands.run(`bash -c "exec 3<>/dev/tcp/127.0.0.1/${port} && echo ok" 2>/dev/null || true`);
    if (r.stdout.includes('ok')) return;
    await Bun.sleep(500);
  }
  throw new Error(`Timed out waiting for port ${port}`);
};

const toHttps = (host: string) => (host.startsWith('http') ? host : `https://${host}`);
const toWss = (host: string) => (host.startsWith('ws') ? host : `wss://${host}`);

const createOpts = () => ({
  apiKey: env.e2bApiKey,
  timeoutMs: SANDBOX_TIMEOUT_MS,
});

export const createSandboxForProject = async (): Promise<SandboxHandles> => {
  const sandbox = env.e2bTemplateId
    ? await Sandbox.create(env.e2bTemplateId, createOpts())
    : await Sandbox.create(createOpts());
  return {
    sandbox,
    previewUrl: toHttps(sandbox.getHost(PREVIEW_PORT)),
    codexWsUrl: toWss(sandbox.getHost(CODEX_PORT)),
  };
};

export const connectSandbox = async (sandboxId: string): Promise<SandboxHandles> => {
  const sandbox = await Sandbox.connect(sandboxId, { apiKey: env.e2bApiKey });
  await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
  return {
    sandbox,
    previewUrl: toHttps(sandbox.getHost(PREVIEW_PORT)),
    codexWsUrl: toWss(sandbox.getHost(CODEX_PORT)),
  };
};

const bootstrapInflight = new Map<string, Promise<void>>();
const bootstrapDone = new Set<string>();

export const isBootstrapDone = (projectId: string): boolean => bootstrapDone.has(projectId);

export const ensureBootstrapForProject = (sandbox: Sandbox, projectId: string): Promise<void> => {
  if (bootstrapDone.has(projectId)) return Promise.resolve();
  const cached = bootstrapInflight.get(projectId);
  if (cached) return cached;
  publish(projectId, { kind: 'bootstrap.started' });
  const p = ensureBootstrapped(sandbox, (line) =>
    publish(projectId, { kind: 'log', level: 'info', message: line }),
  )
    .then(() => {
      bootstrapDone.add(projectId);
      publish(projectId, { kind: 'bootstrap.done' });
    })
    .catch((e) => {
      publish(projectId, { kind: 'bootstrap.failed', message: String(e) });
      throw e;
    });
  bootstrapInflight.set(projectId, p);
  p.catch(() => undefined).finally(() => bootstrapInflight.delete(projectId));
  return p;
};

export const bootstrapInBackground = (sandbox: Sandbox, projectId: string): void => {
  ensureBootstrapForProject(sandbox, projectId).catch(() => undefined);
};

export const mintCapabilityToken = (): string => crypto.randomUUID().replace(/-/g, '');

import { Sandbox } from 'e2b';
import { env } from './env.ts';

const CODEX_PORT = 4500;
const PREVIEW_PORT = 3000;
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;

export type SandboxHandles = {
  sandbox: Sandbox;
  previewUrl: string;
  codexWsUrl: string;
};

const startCodexAppServer = async (sandbox: Sandbox, token: string): Promise<void> => {
  await sandbox.commands.run(
    `pgrep -f 'codex app-server' > /dev/null || nohup codex app-server --listen ws://0.0.0.0:${CODEX_PORT} > /tmp/codex-app-server.log 2>&1 &`,
    {
      background: true,
      envs: {
        OPENAI_API_KEY: env.openaiApiKey,
        CODEX_APP_SERVER_TOKEN: token,
      },
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

export const createSandboxForProject = async (token: string): Promise<SandboxHandles> => {
  const sandbox = await Sandbox.create(env.e2bTemplateId, {
    apiKey: env.e2bApiKey,
    timeoutMs: SANDBOX_TIMEOUT_MS,
  });
  await startCodexAppServer(sandbox, token);
  return {
    sandbox,
    previewUrl: toHttps(sandbox.getHost(PREVIEW_PORT)),
    codexWsUrl: toWss(sandbox.getHost(CODEX_PORT)),
  };
};

export const connectSandbox = async (sandboxId: string, token: string): Promise<SandboxHandles> => {
  const sandbox = await Sandbox.connect(sandboxId, { apiKey: env.e2bApiKey });
  await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
  await startCodexAppServer(sandbox, token);
  return {
    sandbox,
    previewUrl: toHttps(sandbox.getHost(PREVIEW_PORT)),
    codexWsUrl: toWss(sandbox.getHost(CODEX_PORT)),
  };
};

export const mintCapabilityToken = (): string => crypto.randomUUID().replace(/-/g, '');

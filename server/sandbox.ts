import { Sandbox } from 'e2b';
import { env } from './env.ts';
import { ensureBootstrapped } from './bootstrap.ts';
import { publish } from './bus.ts';

const PREVIEW_PORT = 3000;
const SANDBOX_TIMEOUT_MS = 60 * 60 * 1000;

export type SandboxHandles = {
  sandbox: Sandbox;
  previewUrl: string;
};

const toHttps = (host: string) => (host.startsWith('http') ? host : `https://${host}`);

const createOpts = () => ({
  apiKey: env.e2bApiKey,
  timeoutMs: SANDBOX_TIMEOUT_MS,
});

export const createSandboxForProject = async (): Promise<SandboxHandles> => {
  const sandbox = env.e2bTemplateId
    ? await Sandbox.create(env.e2bTemplateId, createOpts())
    : await Sandbox.create(createOpts());
  return { sandbox, previewUrl: toHttps(sandbox.getHost(PREVIEW_PORT)) };
};

export const connectSandbox = async (sandboxId: string): Promise<SandboxHandles> => {
  const sandbox = await Sandbox.connect(sandboxId, { apiKey: env.e2bApiKey });
  await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
  return { sandbox, previewUrl: toHttps(sandbox.getHost(PREVIEW_PORT)) };
};

const bootstrapInflight = new Map<string, Promise<void>>();
const bootstrapDone = new Set<string>();

export const isBootstrapDone = (projectId: string): boolean => bootstrapDone.has(projectId);

export const resetBootstrapForProject = (projectId: string): void => {
  bootstrapInflight.delete(projectId);
  bootstrapDone.delete(projectId);
};

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

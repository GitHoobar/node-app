import type { Sandbox } from 'e2b';
import type { ThreadEvent, ThreadItem } from '@openai/codex-sdk';
import type { CodexEvent } from '@shared/types';

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

export type CodexRunHandle = {
  threadId: string | null;
};

const CODEX_WORKDIR = '/home/user';
const CODEX_SDK_PACKAGE = '@openai/codex-sdk@0.130.0';
const CODEX_SDK_RUNNER_DIR = '/tmp/node-app-codex-sdk-runner';
const CODEX_SDK_RUNNER = `${CODEX_SDK_RUNNER_DIR}/run-codex.mjs`;

const RUNNER_SCRIPT = `import { Codex } from '@openai/codex-sdk';

const readStdin = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

try {
  const { prompt, threadId, model } = JSON.parse(await readStdin());
  const codex = new Codex();
  const threadOptions = {
    workingDirectory: ${JSON.stringify(CODEX_WORKDIR)},
    skipGitRepoCheck: true,
    sandboxMode: 'danger-full-access',
    approvalPolicy: 'never',
    ...(model ? { model } : {}),
  };
  const thread = threadId ? codex.resumeThread(threadId, threadOptions) : codex.startThread(threadOptions);
  const { events } = await thread.runStreamed(prompt);

  for await (const event of events) {
    console.log(JSON.stringify(event));
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(JSON.stringify({ type: 'turn.failed', error: { message } }));
  console.error(error instanceof Error && error.stack ? error.stack : message);
  process.exitCode = 1;
}
`;

export class MissingCodexThreadError extends Error {
  constructor(
    readonly threadId: string,
    message: string,
  ) {
    super(message);
    this.name = 'MissingCodexThreadError';
  }
}

export const isMissingCodexThreadError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /no rollout found for thread id/i.test(message);
};

export const runWithMissingThreadFallback = async (
  initialThreadId: string | null,
  run: (threadId: string | null) => Promise<{ threadId: string | null }>,
  onMissingThread: (threadId: string) => void | Promise<void>,
): Promise<{ threadId: string | null }> => {
  try {
    return await run(initialThreadId);
  } catch (error) {
    if (!initialThreadId || !isMissingCodexThreadError(error)) throw error;
    await onMissingThread(initialThreadId);
    return run(null);
  }
};

type CodexSdkEvent = Partial<ThreadEvent> & {
  type?: string;
  thread_id?: string;
  threadId?: string;
  turn_id?: string;
  turnId?: string;
  item?: Partial<ThreadItem> & { id?: string; type?: string };
  error?: { message?: string } | string;
  message?: string;
};

const itemKind = (itemType: string | undefined): 'message' | 'reasoning' | 'file_change' | 'command' | 'tool_call' => {
  if (itemType === 'reasoning') return 'reasoning';
  if (itemType === 'file_change' || itemType === 'patch_apply') return 'file_change';
  if (itemType === 'command_execution') return 'command';
  if (itemType === 'mcp_tool_call' || itemType === 'web_search') return 'tool_call';
  return 'message';
};

const mapItem = (event: CodexSdkEvent): CodexEvent | null => {
  const type = event?.type as string | undefined;
  if (!type) return null;
  switch (type) {
    case 'thread.started': {
      const startedThreadId = event.thread_id ?? event.threadId;
      return startedThreadId ? { type: 'thread.started', threadId: startedThreadId } : null;
    }
    case 'turn.started':
      return { type: 'turn.started', turnId: event.turn_id ?? event.turnId ?? 'turn' };
    case 'turn.completed':
      return { type: 'turn.completed', turnId: event.turn_id ?? event.turnId ?? 'turn' };
    case 'turn.failed':
      return {
        type: 'turn.failed',
        turnId: event.turn_id ?? 'turn',
        error: typeof event.error === 'string' ? event.error : event.error?.message,
      };
    case 'item.started':
    case 'item.updated':
    case 'item.delta':
    case 'item.completed': {
      const item = event.item ?? {};
      return {
        type: type === 'item.updated' ? 'item.delta' : (type as 'item.started' | 'item.delta' | 'item.completed'),
        itemId: item.id ?? 'item',
        kind: itemKind(item.type),
        payload: item,
      };
    }
    case 'error':
      return { type: 'error', message: event.message ?? 'unknown' };
    default:
      return null;
  }
};

const MODEL = process.env.CODEX_MODEL ?? '';

const ensureCodexSdkRunner = async (sandbox: Sandbox): Promise<void> => {
  const sdkInstalled = await sandbox.commands.run(
    `test -d ${shellQuote(`${CODEX_SDK_RUNNER_DIR}/node_modules/@openai/codex-sdk`)} && echo yes || echo no`,
  );
  if (sdkInstalled.stdout.trim() !== 'yes') {
    const installScript = [
      'set -eu',
      'export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"',
      `rm -rf ${shellQuote(CODEX_SDK_RUNNER_DIR)}`,
      `mkdir -p ${shellQuote(CODEX_SDK_RUNNER_DIR)}`,
      `npm install --prefix ${shellQuote(CODEX_SDK_RUNNER_DIR)} ${shellQuote(CODEX_SDK_PACKAGE)} --no-audit --no-fund --loglevel=error`,
    ].join('\n');
    await sandbox.commands.run(`bash -lc ${shellQuote(installScript)}`, { timeoutMs: 5 * 60_000 });
  }

  const runnerInstalled = await sandbox.commands.run(`test -f ${shellQuote(CODEX_SDK_RUNNER)} && echo yes || echo no`);
  if (runnerInstalled.stdout.trim() !== 'yes') {
    await sandbox.commands.run(`bash -c "rm -f ${shellQuote(CODEX_SDK_RUNNER)}"`);
    await sandbox.files.write(CODEX_SDK_RUNNER, RUNNER_SCRIPT);
  }
};

export const runCodex = async (
  sandbox: Sandbox,
  prompt: string,
  threadId: string | null,
  onEvent: (e: CodexEvent) => void,
): Promise<{ threadId: string | null }> => {
  await ensureCodexSdkRunner(sandbox);

  // E2B file writes cannot overwrite existing files, so each turn gets fresh runner input.
  const inputPath = `/tmp/codex-sdk-input-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  await sandbox.commands.run(`bash -c "rm -f ${shellQuote(inputPath)}"`);
  await sandbox.files.write(inputPath, JSON.stringify({ prompt, threadId, model: MODEL || null }));
  const cmd = `bash -lc ${shellQuote(`node ${shellQuote(CODEX_SDK_RUNNER)} < ${shellQuote(inputPath)}`)}`;
  let buf = '';
  let stderr = '';
  let observedThreadId: string | null = threadId;

  const emitStderr = (): void => {
    const message = stderr.trim();
    if (message) onEvent({ type: 'error', message });
  };

  const throwIfMissingThread = (fallbackMessage: string): void => {
    const message = stderr.trim() || fallbackMessage;
    if (threadId && isMissingCodexThreadError(message)) {
      throw new MissingCodexThreadError(threadId, message);
    }
  };

  try {
    const proc = await sandbox.commands.run(cmd, {
      timeoutMs: 15 * 60_000,
      onStdout: (chunk: string) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'thread.started' && (ev.thread_id ?? ev.threadId)) {
              observedThreadId = ev.thread_id ?? ev.threadId;
            }
            const mapped = mapItem(ev);
            if (mapped) onEvent(mapped);
          } catch {
            // The SDK runner writes JSONL to stdout, but keep this tolerant of incidental output.
          }
        }
      },
      onStderr: (chunk: string) => {
        stderr += chunk;
      },
    });

    if (proc.exitCode !== 0) {
      throwIfMissingThread(`codex SDK runner exit ${proc.exitCode}`);
      onEvent({ type: 'turn.failed', turnId: 'final', error: `codex SDK runner exit ${proc.exitCode}` });
      throw new Error(`codex SDK runner exit ${proc.exitCode}`);
    }
  } catch (error) {
    throwIfMissingThread(error instanceof Error ? error.message : String(error));
    emitStderr();
    throw error;
  }

  emitStderr();
  return { threadId: observedThreadId };
};

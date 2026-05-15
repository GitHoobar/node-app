import type { Sandbox } from 'e2b';
import type { CodexEvent } from '@shared/types';

const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

export type CodexExecHandle = {
  threadId: string | null;
};

const mapItem = (event: any): CodexEvent | null => {
  const type = event?.type as string | undefined;
  if (!type) return null;
  switch (type) {
    case 'thread.started':
      return { type: 'thread.started', threadId: event.thread_id ?? event.threadId };
    case 'turn.started':
      return { type: 'turn.started', turnId: event.turn_id ?? event.turnId ?? 'turn' };
    case 'turn.completed':
      return { type: 'turn.completed', turnId: event.turn_id ?? event.turnId ?? 'turn' };
    case 'turn.failed':
      return { type: 'turn.failed', turnId: event.turn_id ?? 'turn', error: event.error?.message ?? String(event.error) };
    case 'item.started':
    case 'item.delta':
    case 'item.completed': {
      const item = event.item ?? {};
      let kind: 'message' | 'reasoning' | 'file_change' | 'command' | 'tool_call' = 'message';
      if (item.type === 'reasoning') kind = 'reasoning';
      else if (item.type === 'file_change' || item.type === 'patch_apply') kind = 'file_change';
      else if (item.type === 'command_execution') kind = 'command';
      else if (item.type === 'mcp_tool_call' || item.type === 'web_search') kind = 'tool_call';
      else if (item.type === 'agent_message') kind = 'message';
      return { type: type as 'item.completed', itemId: item.id ?? 'item', kind, payload: item };
    }
    case 'error':
      return { type: 'error', message: event.message ?? 'unknown' };
    default:
      return null;
  }
};

const MODEL = process.env.CODEX_MODEL ?? '';

export const runCodexExec = async (
  sandbox: Sandbox,
  prompt: string,
  threadId: string | null,
  onEvent: (e: CodexEvent) => void,
): Promise<{ threadId: string | null }> => {
  // write prompt to a fresh file per turn to dodge E2B's "files.write can't overwrite" quirk
  const promptPath = `/tmp/codex-prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  await sandbox.commands.run(`bash -c "rm -f ${promptPath}"`);
  await sandbox.files.write(promptPath, prompt);
  const modelFlag = MODEL ? `-m ${shellQuote(MODEL)}` : '';
  // codex exec's flags (-C, --json, -m, etc.) must come BEFORE the `resume` subcommand;
  // resume is a sub-subcommand with its own parser that doesn't know -C.
  // pipe the prompt file as stdin (codex reads stdin when prompt arg is '-' or omitted).
  const resumePart = threadId ? `resume ${shellQuote(threadId)} -` : '-';
  const cmd = `bash -lc 'codex exec ${modelFlag} --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox --json -C /home/user ${resumePart} < ${promptPath}'`;
  let buf = '';
  let observedThreadId: string | null = threadId;

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
          // not valid JSON, ignore (could be banner/debug text)
        }
      }
    },
    onStderr: (chunk: string) => {
      onEvent({ type: 'error', message: chunk.trim() });
    },
  });

  if (proc.exitCode !== 0) {
    onEvent({ type: 'turn.failed', turnId: 'final', error: `codex exec exit ${proc.exitCode}` });
  }
  return { threadId: observedThreadId };
};

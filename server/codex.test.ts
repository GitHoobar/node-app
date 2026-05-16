import { describe, expect, test } from 'bun:test';
import { MissingCodexThreadError, isMissingCodexThreadError, runWithMissingThreadFallback } from './codex';

const staleThreadMessage =
  'thread/resume: thread/resume failed: no rollout found for thread id 019e3007-3e4a-7d12-a58b-34ef76b70335 (code -32600)';

describe('missing Codex thread handling', () => {
  test('detects stale thread resume errors', () => {
    expect(isMissingCodexThreadError(staleThreadMessage)).toBe(true);
    expect(isMissingCodexThreadError(new Error(staleThreadMessage))).toBe(true);
    expect(isMissingCodexThreadError(new Error('codex SDK runner exit 1'))).toBe(false);
  });

  test('clears the stale thread and retries with a fresh thread', async () => {
    const calls: Array<string | null> = [];
    const cleared: string[] = [];

    const result = await runWithMissingThreadFallback(
      'stale-thread',
      async (threadId) => {
        calls.push(threadId);
        if (threadId) throw new MissingCodexThreadError(threadId, staleThreadMessage);
        return { threadId: 'fresh-thread' };
      },
      (threadId) => {
        cleared.push(threadId);
      },
    );

    expect(calls).toEqual(['stale-thread', null]);
    expect(cleared).toEqual(['stale-thread']);
    expect(result.threadId).toBe('fresh-thread');
  });

  test('does not retry fresh runs or unrelated failures', async () => {
    await expect(
      runWithMissingThreadFallback(
        null,
        async () => {
          throw new Error(staleThreadMessage);
        },
        () => {
          throw new Error('should not clear');
        },
      ),
    ).rejects.toThrow(staleThreadMessage);

    await expect(
      runWithMissingThreadFallback(
        'existing-thread',
        async () => {
          throw new Error('network failed');
        },
        () => {
          throw new Error('should not clear');
        },
      ),
    ).rejects.toThrow('network failed');
  });
});

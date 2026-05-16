import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { projects } from '../db.ts';
import { getSession, refreshLoginState } from '../sessions.ts';
import { subscribe, publish } from '../bus.ts';
import { compileTreeToPrompt, diffTrees, treeDiffHasChanges } from '../tree.ts';
import { runCodex, runWithMissingThreadFallback } from '../codex.ts';
import { ensureDevServer } from '../bootstrap.ts';
import { snapshotProjectFiles } from '../project-files.ts';
import type { Project } from '@shared/types';

const runCodexForProject = async (
  id: string,
  project: Project,
  prompt: string,
  afterRun?: () => Promise<void>,
): Promise<void> => {
  const session = await getSession(id);
  if (!session.loggedIn) {
    const logged = await refreshLoginState(id);
    if (!logged) {
      publish(id, { kind: 'log', level: 'error', message: 'codex not connected — click Connect Codex first' });
      return;
    }
  }
  const { threadId: nextThreadId } = await runWithMissingThreadFallback(
    project.codexThreadId,
    (threadId) => runCodex(session.sandbox, prompt, threadId, (event) => publish(id, { kind: 'codex', event })),
    async (missingThreadId) => {
      await projects.setThreadId(id, null);
      publish(id, {
        kind: 'log',
        level: 'warn',
        message: `saved Codex thread was missing (${missingThreadId.slice(0, 8)}); starting a fresh thread`,
      });
    },
  );
  if (nextThreadId && nextThreadId !== project.codexThreadId) {
    await projects.setThreadId(id, nextThreadId);
  }
  await ensureDevServer(session.sandbox, (line) => publish(id, { kind: 'log', level: 'info', message: line }));
  await snapshotProjectFiles(session.sandbox, id, (line) => publish(id, { kind: 'log', level: 'info', message: line }));
  await afterRun?.();
  publish(id, { kind: 'preview.reload' });
};

export const generateRouter = new Hono()
  .post('/:id/generate', async (c) => {
    const id = c.req.param('id');
    const p = await projects.get(id);
    if (!p) return c.json({ error: 'not_found' }, 404);

    const previousTree = await projects.getLastGeneratedTree(id);
    if (previousTree) {
      const diff = diffTrees(previousTree, p.tree);
      if (!treeDiffHasChanges(diff)) {
        publish(id, { kind: 'log', level: 'info', message: 'no tree changes since last generation; skipped Codex run' });
        return c.json({ ok: true, skipped: true });
      }
    }

    const prompt = compileTreeToPrompt(p.tree, { previousTree, hasExistingApp: Boolean(p.codexThreadId) });
    publish(id, { kind: 'log', level: 'info', message: 'generating…' });

    queueMicrotask(async () => {
      try {
        await runCodexForProject(id, p, prompt, () => projects.setLastGeneratedTree(id, p.tree));
      } catch (err) {
        publish(id, { kind: 'log', level: 'error', message: String(err) });
      }
    });

    return c.json({ ok: true });
  })
  .post('/:id/chat', async (c) => {
    const id = c.req.param('id');
    const p = await projects.get(id);
    if (!p) return c.json({ error: 'not_found' }, 404);

    const body = await c.req.json().catch(() => ({}));
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return c.json({ error: 'missing_message' }, 400);

    const prompt = [
      'The user is giving a direct instruction for the app in this sandbox.',
      'Apply it in the current project, keep the change focused, and leave the preview app runnable.',
      '',
      'User instruction:',
      message,
    ].join('\n');

    publish(id, { kind: 'log', level: 'info', message: 'sending instruction to Codex…' });
    queueMicrotask(async () => {
      try {
        await runCodexForProject(id, p, prompt);
      } catch (err) {
        publish(id, { kind: 'log', level: 'error', message: String(err) });
      }
    });

    return c.json({ ok: true });
  })
  .get('/:id/stream', async (c) => {
    const id = c.req.param('id');
    if (!(await projects.get(id))) return c.json({ error: 'not_found' }, 404);

    return streamSSE(c, async (stream) => {
      const queue: string[] = [];
      let resolveNext: (() => void) | null = null;
      const unsub = subscribe(id, (sse) => {
        queue.push(JSON.stringify(sse));
        resolveNext?.();
        resolveNext = null;
      });

      stream.onAbort(() => unsub());

      const p = await projects.get(id);
      if (p?.previewUrl) {
        await stream.writeSSE({ event: 'message', data: JSON.stringify({ kind: 'preview.url', url: p.previewUrl }) });
      }

      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((res) => {
            resolveNext = res;
          });
        }
        const data = queue.shift()!;
        await stream.writeSSE({ event: 'message', data });
      }
    });
  });

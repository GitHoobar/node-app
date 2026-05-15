import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { projects } from '../db.ts';
import { getSession } from '../sessions.ts';
import { subscribe, publish } from '../bus.ts';
import { compileTreeToPrompt } from '../tree.ts';

export const generateRouter = new Hono()
  .post('/:id/generate', async (c) => {
    const id = c.req.param('id');
    const p = projects.get(id);
    if (!p) return c.json({ error: 'not_found' }, 404);

    const prompt = compileTreeToPrompt(p.tree);
    publish(id, { kind: 'log', level: 'info', message: 'generating…' });

    queueMicrotask(async () => {
      try {
        const session = await getSession(id);
        let threadId = p.codexThreadId;
        if (!threadId) {
          threadId = await session.codex.createThread('/home/user');
          projects.setThreadId(id, threadId);
        } else {
          await session.codex.resumeThread(threadId).catch(async () => {
            threadId = await session.codex.createThread('/home/user');
            projects.setThreadId(id, threadId!);
          });
        }
        await session.codex.sendUserMessage(threadId!, prompt);
      } catch (err) {
        publish(id, { kind: 'log', level: 'error', message: String(err) });
      }
    });

    return c.json({ ok: true });
  })
  .get('/:id/stream', (c) => {
    const id = c.req.param('id');
    if (!projects.get(id)) return c.json({ error: 'not_found' }, 404);

    return streamSSE(c, async (stream) => {
      const queue: string[] = [];
      let resolveNext: (() => void) | null = null;
      const unsub = subscribe(id, (sse) => {
        queue.push(JSON.stringify(sse));
        resolveNext?.();
        resolveNext = null;
      });

      stream.onAbort(() => unsub());

      const p = projects.get(id);
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
        const parsed = JSON.parse(data) as { kind: string; event?: { type?: string } };
        if (parsed.kind === 'codex' && parsed.event?.type === 'turn.completed') {
          await stream.writeSSE({ event: 'message', data: JSON.stringify({ kind: 'preview.reload' }) });
        }
      }
    });
  });

import { Hono } from 'hono';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { projects, emptyTree } from '../db.ts';
import { mintCapabilityToken } from '../sandbox.ts';
import { publish } from '../bus.ts';
import type { Project, TreeNode } from '@shared/types';

const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    prompt: z.string(),
    children: z.array(TreeNodeSchema),
  }),
);

export const projectsRouter = new Hono()
  .get('/', (c) => c.json(projects.list()))
  .post('/', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const name = typeof body.name === 'string' && body.name ? body.name : 'Untitled Project';
    const token = mintCapabilityToken();
    const id = nanoid(12);
    const project: Project = {
      id,
      name,
      sandboxId: null,
      codexThreadId: null,
      capabilityToken: token,
      tree: emptyTree(),
      previewUrl: null,
      updatedAt: Date.now(),
    };
    projects.insert(project);
    return c.json(project);
  })
  .get('/:id', (c) => {
    const p = projects.get(c.req.param('id'));
    return p ? c.json(p) : c.json({ error: 'not_found' }, 404);
  })
  .get('/:id/preview/ready', async (c) => {
    const p = projects.get(c.req.param('id'));
    if (!p?.previewUrl) return c.json({ ready: false });
    try {
      const r = await fetch(p.previewUrl, { signal: AbortSignal.timeout(2500), redirect: 'manual' });
      const html = await r.text().catch(() => '');
      const isE2bErrorPage =
        html.includes('Closed Port Error') ||
        html.includes('Connection refused') ||
        html.includes('The sandbox is running but port is not open') ||
        html.includes('The sandbox was not found');
      return c.json({ ready: !isE2bErrorPage });
    } catch {
      return c.json({ ready: false });
    }
  })
  .patch('/:id/tree', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const parsed = TreeNodeSchema.safeParse(body.tree);
    if (!parsed.success) return c.json({ error: 'invalid_tree' }, 400);
    if (!projects.get(id)) return c.json({ error: 'not_found' }, 404);
    projects.updateTree(id, parsed.data);
    publish(id, { kind: 'log', level: 'info', message: 'tree updated' });
    return c.json({ ok: true });
  });

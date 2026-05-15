import type { TreeNode } from '@shared/types';
import { ROOT_NODE_ID } from '@shared/types';

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';

export type CompiledPage = {
  id: string;
  route: string;
  prompt: string;
  links: string[];
};

export const compileTree = (root: TreeNode): CompiledPage[] => {
  const used = new Set<string>();
  const pages: CompiledPage[] = [];
  const idToRoute = new Map<string, string>();

  const visit = (node: TreeNode): void => {
    let route: string;
    if (node.id === ROOT_NODE_ID) {
      route = '/';
    } else {
      const base = '/' + slugify(node.name);
      let candidate = base;
      let i = 2;
      while (used.has(candidate)) candidate = `${base}-${i++}`;
      route = candidate;
    }
    used.add(route);
    idToRoute.set(node.id, route);
    pages.push({ id: node.id, route, prompt: node.prompt, links: [] });
    for (const child of node.children) visit(child);
  };
  visit(root);

  const fillLinks = (node: TreeNode): void => {
    const page = pages.find((p) => p.id === node.id)!;
    page.links = node.children.map((c) => idToRoute.get(c.id)!);
    for (const child of node.children) fillLinks(child);
  };
  fillLinks(root);

  return pages;
};

export const compileTreeToPrompt = (root: TreeNode): string => {
  const pages = compileTree(root);
  const pageBlocks = pages
    .map((p) => {
      const links = p.links.length ? `\n  Links to: ${p.links.map((l) => `\`${l}\``).join(', ')}` : '';
      const body = p.prompt.trim() || '(no description — keep this page simple)';
      return `- \`${p.route}\` — ${body}${links}`;
    })
    .join('\n');

  return `You are editing a Next.js 16 (App Router) project at \`/home/user\`. Implement EXACTLY these pages — create or rewrite each one to match its description. Use Tailwind CSS and shadcn/ui components where helpful. Every page MUST render a top-level <nav> that links to every route listed under "Links to" with Next.js <Link> components. Keep \`app/layout.tsx\` minimal. Do not modify build/config files unless strictly required.

For each page \`<route>\`, write the file:
  - \`/\`             → \`app/page.tsx\`
  - \`/something\`    → \`app/something/page.tsx\`

Pages:
${pageBlocks}

After writing files, do NOT run \`bun run dev\` or \`next dev\` — the dev server is already running and will hot-reload your changes automatically.`;
};

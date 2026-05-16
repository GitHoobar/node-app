import type { TreeNode } from '@shared/types';

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
    const base = '/' + slugify(node.name);
    let candidate = base;
    let i = 2;
    while (used.has(candidate)) candidate = `${base}-${i++}`;
    const route = candidate;
    used.add(route);
    idToRoute.set(node.id, route);
    pages.push({ id: node.id, route, prompt: node.prompt, links: [] });
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);

  const globalLinks = root.children.map((child) => idToRoute.get(child.id)).filter((route): route is string => Boolean(route));

  const fillLinks = (node: TreeNode): void => {
    const page = pages.find((p) => p.id === node.id)!;
    const childLinks = node.children.map((c) => idToRoute.get(c.id)!);
    page.links = [...new Set([...globalLinks, ...childLinks])];
    for (const child of node.children) fillLinks(child);
  };
  for (const child of root.children) fillLinks(child);

  return pages;
};

export const compileTreeToPrompt = (root: TreeNode): string => {
  const pages = compileTree(root);
  const appDescription = root.prompt.trim() || '(no global description)';
  const pageBlocks = pages
    .map((p) => {
      const links = p.links.length ? `\n  Links to: ${p.links.map((l) => `\`${l}\``).join(', ')}` : '';
      const body = p.prompt.trim() || '(no description — keep this page simple)';
      return `- \`${p.route}\` — ${body}${links}`;
    })
    .join('\n') || '(no page routes configured yet)';

  return `You are editing a Next.js 16 (App Router) project at \`/home/user\`. The root App node is global app guidance, not a routable page. Implement EXACTLY these page routes — create or rewrite each listed page to match its description. Use Tailwind CSS and shadcn/ui components where helpful. Every page MUST render a top-level <nav> that links to every route listed under "Links to" with Next.js <Link> components. Keep \`app/layout.tsx\` minimal and aligned with the global app instructions. Do not modify build/config files unless strictly required.

Global app instructions:
${appDescription}

For each page \`<route>\`, write the file using Next.js App Router conventions:
  - \`/something\`    → \`app/something/page.tsx\`

Pages:
${pageBlocks}

After writing files, do NOT run \`bun run dev\` or \`next dev\` — the dev server is already running and will hot-reload your changes automatically.`;
};

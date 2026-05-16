import type { TreeNode } from '@shared/types';

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';

export type CompiledPage = {
  id: string;
  name: string;
  route: string;
  prompt: string;
  links: string[];
};

export type PageDiff = {
  before: CompiledPage;
  after: CompiledPage;
  reasons: string[];
};

export type TreeDiff = {
  appPromptChanged: boolean;
  previousAppDescription: string;
  currentAppDescription: string;
  addedPages: CompiledPage[];
  removedPages: CompiledPage[];
  changedPages: PageDiff[];
  unchangedPages: CompiledPage[];
};

export type CompilePromptOptions = {
  previousTree?: TreeNode | null;
  hasExistingApp?: boolean;
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
    pages.push({ id: node.id, name: node.name, route, prompt: node.prompt, links: [] });
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

const appDescriptionFor = (root: TreeNode): string => root.prompt.trim() || '(no global description)';

const pageDescriptionFor = (page: CompiledPage): string => page.prompt.trim() || '(no description - keep this page simple)';

const linksForPrompt = (links: string[]): string =>
  links.length ? `\n  Links to: ${links.map((link) => `\`${link}\``).join(', ')}` : '';

const pageSummaryFor = (page: CompiledPage): string => {
  const name = page.name.trim() || 'Untitled';
  return `\`${page.route}\` (${name}) - ${pageDescriptionFor(page)}${linksForPrompt(page.links)}`;
};

const pageLineFor = (page: CompiledPage): string => `- ${pageSummaryFor(page)}`;

const sameList = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const linkListFor = (links: string[]): string => (links.length ? links.map((route) => `\`${route}\``).join(', ') : '(none)');

const routeListFor = (pages: CompiledPage[]): string =>
  pages.length ? pages.map((page) => `\`${page.route}\``).join(', ') : '(none)';

const pageChangeReasons = (before: CompiledPage, after: CompiledPage): string[] => {
  const reasons: string[] = [];
  if (before.route !== after.route) reasons.push(`route changed from \`${before.route}\` to \`${after.route}\``);
  if (before.name.trim() !== after.name.trim()) reasons.push(`page name changed from "${before.name}" to "${after.name}"`);
  if (pageDescriptionFor(before) !== pageDescriptionFor(after)) reasons.push('page prompt changed');
  if (!sameList(before.links, after.links)) {
    reasons.push(`navigation links changed from ${linkListFor(before.links)} to ${linkListFor(after.links)}`);
  }
  return reasons;
};

export const diffTrees = (previousRoot: TreeNode, currentRoot: TreeNode): TreeDiff => {
  const previousPages = compileTree(previousRoot);
  const currentPages = compileTree(currentRoot);
  const previousById = new Map(previousPages.map((page) => [page.id, page]));
  const currentById = new Map(currentPages.map((page) => [page.id, page]));
  const changedPages: PageDiff[] = [];
  const unchangedPages: CompiledPage[] = [];

  for (const currentPage of currentPages) {
    const previousPage = previousById.get(currentPage.id);
    if (!previousPage) continue;
    const reasons = pageChangeReasons(previousPage, currentPage);
    if (reasons.length) changedPages.push({ before: previousPage, after: currentPage, reasons });
    else unchangedPages.push(currentPage);
  }

  return {
    appPromptChanged: appDescriptionFor(previousRoot) !== appDescriptionFor(currentRoot),
    previousAppDescription: appDescriptionFor(previousRoot),
    currentAppDescription: appDescriptionFor(currentRoot),
    addedPages: currentPages.filter((page) => !previousById.has(page.id)),
    removedPages: previousPages.filter((page) => !currentById.has(page.id)),
    changedPages,
    unchangedPages,
  };
};

export const treeDiffHasChanges = (diff: TreeDiff): boolean =>
  diff.appPromptChanged || diff.addedPages.length > 0 || diff.removedPages.length > 0 || diff.changedPages.length > 0;

const fullGenerationPrompt = (root: TreeNode): string => {
  const pages = compileTree(root);
  const appDescription = appDescriptionFor(root);
  const pageBlocks = pages.map(pageLineFor).join('\n') || '(no page routes configured yet)';

  return `You are editing a Next.js 16 (App Router) project at \`/home/user\`. The root App node is global app guidance, not a routable page. Create exactly these page routes for the initial app. Use Tailwind CSS and shadcn/ui components where helpful. Every page MUST render a top-level <nav> that links to every route listed under "Links to" with Next.js <Link> components. Keep \`app/layout.tsx\` minimal and aligned with the global app instructions. Do not modify build/config files unless strictly required.

Global app instructions:
${appDescription}

For each page \`<route>\`, write the file using Next.js App Router conventions:
  - \`/something\`    → \`app/something/page.tsx\`

Pages:
${pageBlocks}

After writing files, do NOT run \`bun run dev\` or \`next dev\` — the dev server is already running and will hot-reload your changes automatically.`;
};

const diffBlockFor = (diff: TreeDiff): string => {
  const sections: string[] = [];

  if (diff.appPromptChanged) {
    sections.push(`Global app guidance changed:
- Previous: ${diff.previousAppDescription}
- Current: ${diff.currentAppDescription}`);
  }

  if (diff.addedPages.length) {
    sections.push(`Added pages:
${diff.addedPages.map((page) => `- Create ${pageSummaryFor(page)}`).join('\n')}`);
  }

  if (diff.removedPages.length) {
    sections.push(`Removed pages:
${diff.removedPages.map((page) => `- Remove obsolete route \`${page.route}\` (${page.name.trim() || 'Untitled'}) and remove links to it.`).join('\n')}`);
  }

  if (diff.changedPages.length) {
    sections.push(`Existing pages with required updates:
${diff.changedPages
  .map((change) => `- Update \`${change.after.route}\`: ${change.reasons.join('; ')}.\n  Target: ${pageSummaryFor(change.after)}`)
  .join('\n')}`);
  }

  if (!sections.length) return 'No tree changes since the last successful generation. Make no code edits.';
  return sections.join('\n\n');
};

const incrementalGenerationPrompt = (root: TreeNode, previousTree: TreeNode | null): string => {
  const pages = compileTree(root);
  const appDescription = appDescriptionFor(root);
  const pageBlocks = pages.map(pageLineFor).join('\n') || '(no page routes configured yet)';
  const diff = previousTree ? diffTrees(previousTree, root) : null;
  const changeSet = diff
    ? diffBlockFor(diff)
    : 'No stored baseline tree is available for this existing app. Inspect the existing files first, then reconcile them to the target routes below with the smallest possible edits.';
  const unchanged = diff?.unchangedPages.length
    ? `\n\nUnchanged routes to preserve unless a listed navigation/shared-layout change requires touching them:\n${routeListFor(diff.unchangedPages)}`
    : '';

  return `You are editing an existing Next.js 16 (App Router) project at \`/home/user\`. This is an incremental update request for an app that already exists. Work from the existing files and make the smallest code changes required by the change set. Do not regenerate the whole app, rewrite unchanged routes, redesign unrelated UI, or replace shared structure unless a listed change requires it.

The root App node is global app guidance, not a routable page. Use Tailwind CSS and shadcn/ui components where helpful. Every page MUST render a top-level <nav> that links to every route listed under "Links to" with Next.js <Link> components. If only navigation links changed, update navigation only and preserve page content. Keep \`app/layout.tsx\` minimal and aligned with the global app instructions. Do not modify build/config files unless strictly required.

Current global app instructions:
${appDescription}

Change set since the last successful generation:
${changeSet}${unchanged}

Current target route contract for context:
${pageBlocks}

After writing files, do NOT run \`bun run dev\` or \`next dev\` - the dev server is already running and will hot-reload your changes automatically.`;
};

export const compileTreeToPrompt = (root: TreeNode, options: CompilePromptOptions = {}): string => {
  if (options.previousTree || options.hasExistingApp) {
    return incrementalGenerationPrompt(root, options.previousTree ?? null);
  }
  return fullGenerationPrompt(root);
};

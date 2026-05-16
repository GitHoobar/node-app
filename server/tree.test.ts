import { describe, expect, test } from 'bun:test';
import type { TreeNode } from '@shared/types';
import { APP_ROOT_NAME, ROOT_NODE_ID } from '@shared/types';
import { compileTree, compileTreeToPrompt } from './tree';

const makeTree = (): TreeNode => ({
  id: ROOT_NODE_ID,
  name: APP_ROOT_NAME,
  prompt: 'Use a compact SaaS shell.',
  children: [
    {
      id: 'home',
      name: 'Home',
      prompt: 'Dashboard landing page.',
      children: [{ id: 'reports', name: 'Reports', prompt: 'Reports page.', children: [] }],
    },
    { id: 'settings', name: 'Settings', prompt: 'Settings page.', children: [] },
  ],
});

describe('compileTree', () => {
  test('treats the App root as a global parent instead of a routable Home page', () => {
    const pages = compileTree(makeTree());

    expect(pages.map((page) => page.route)).toEqual(['/home', '/reports', '/settings']);
    expect(pages.some((page) => page.id === ROOT_NODE_ID)).toBe(false);
    expect(pages.some((page) => page.route === '/')).toBe(false);
  });

  test('adds top-level App children to page links', () => {
    const pages = compileTree(makeTree());

    expect(pages.find((page) => page.route === '/home')!.links).toEqual(['/home', '/settings', '/reports']);
    expect(pages.find((page) => page.route === '/settings')!.links).toEqual(['/home', '/settings']);
    expect(pages.find((page) => page.route === '/reports')!.links).toEqual(['/home', '/settings']);
  });

  test('keeps duplicate page names routable without using the App root as fallback', () => {
    const tree = makeTree();
    tree.children.push({ id: 'home-2', name: 'Home', prompt: 'Second home-like page.', children: [] });

    expect(compileTree(tree).map((page) => page.route)).toEqual(['/home', '/reports', '/settings', '/home-2']);
  });
});

describe('compileTreeToPrompt', () => {
  test('describes the App root as global guidance and omits an App page route', () => {
    const prompt = compileTreeToPrompt(makeTree());

    expect(prompt).toContain('The root App node is global app guidance, not a routable page.');
    expect(prompt).toContain('Global app instructions:\nUse a compact SaaS shell.');
    expect(prompt).toContain('- `/home`');
    expect(prompt).toContain('- `/settings`');
    expect(prompt).not.toContain('- `/`');
  });
});

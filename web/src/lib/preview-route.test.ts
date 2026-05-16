import { describe, expect, test } from 'bun:test';
import type { TreeNode } from '@shared/types';
import { APP_ROOT_NAME, ROOT_NODE_ID } from '@shared/types';
import { previewUrlForTree } from './preview-route';

const treeWithPage = (name: string): TreeNode => ({
  id: ROOT_NODE_ID,
  name: APP_ROOT_NAME,
  prompt: '',
  children: [{ id: 'first', name, prompt: '', children: [] }],
});

describe('previewUrlForTree', () => {
  test('opens the first real page route because App is not routable', () => {
    expect(previewUrlForTree('https://sandbox.e2b.app', treeWithPage('Home'))).toBe('https://sandbox.e2b.app/home');
    expect(previewUrlForTree('https://sandbox.e2b.app', treeWithPage('Workspace Cards'))).toBe(
      'https://sandbox.e2b.app/workspace-cards',
    );
  });

  test('keeps the base URL when there are no page children or the URL is invalid', () => {
    expect(previewUrlForTree('https://sandbox.e2b.app', { ...treeWithPage('Home'), children: [] })).toBe(
      'https://sandbox.e2b.app',
    );
    expect(previewUrlForTree('not a url', treeWithPage('Home'))).toBe('not a url');
  });
});

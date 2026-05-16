import type { TreeNode } from '@shared/types';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';

export const previewUrlForTree = (baseUrl: string, tree: TreeNode | null): string => {
  const firstPage = tree?.children[0];
  if (!firstPage) return baseUrl;

  try {
    const url = new URL(baseUrl);
    url.pathname = `/${slugify(firstPage.name)}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return baseUrl;
  }
};

import { describe, expect, test } from 'bun:test';
import { APP_ROOT_NAME, ROOT_NODE_ID } from '@shared/types';
import { formatTreeJson, parseTreeJson } from './tree-json';

const validTree = {
  id: ROOT_NODE_ID,
  name: APP_ROOT_NAME,
  prompt: 'CRM shell',
  children: [
    {
      id: 'accounts',
      name: 'accounts',
      prompt: 'Accounts table',
      children: [{ id: 'account-detail', name: 'account detail', prompt: 'Account detail', children: [] }],
    },
  ],
};

describe('tree json parsing', () => {
  test('parses a valid pasted tree config', () => {
    const result = parseTreeJson(JSON.stringify(validTree));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.tree).toEqual(validTree);
  });

  test('formats the tree config for editing', () => {
    expect(formatTreeJson(validTree)).toContain('\n  "id": "root"');
  });

  test('rejects malformed tree configs before they reach React Flow', () => {
    expect(parseTreeJson('{').ok).toBe(false);
    expect(parseTreeJson(JSON.stringify({ ...validTree, id: 'not-root' }))).toEqual({
      ok: false,
      error: 'root.id must be "root"',
    });
    expect(
      parseTreeJson(
        JSON.stringify({
          ...validTree,
          children: [
            {
              id: 'accounts',
              name: 'duplicate',
              prompt: '',
              children: [{ id: 'accounts', name: 'duplicate', prompt: '', children: [] }],
            },
          ],
        }),
      ),
    ).toEqual({ ok: false, error: 'duplicate node id "accounts"' });
  });
});

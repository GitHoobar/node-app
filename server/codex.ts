import { randomUUID } from 'node:crypto';
import type { CodexEvent } from '@shared/types';

type Resolver = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

export class CodexClient {
  private ws!: WebSocket;
  private pending = new Map<string, Resolver>();
  private listeners: ((e: CodexEvent) => void)[] = [];
  private autoApprove = true;

  static async connect(wsUrl: string, token: string): Promise<CodexClient> {
    const c = new CodexClient();
    const url = new URL(wsUrl);
    url.searchParams.set('token', token);
    c.ws = new WebSocket(url.toString());
    await new Promise<void>((res, rej) => {
      c.ws.addEventListener('open', () => res(), { once: true });
      c.ws.addEventListener('error', (e) => rej(e), { once: true });
    });
    c.ws.addEventListener('message', (m) => c.onMessage(JSON.parse(String(m.data))));
    await c.request('initialize', { protocolVersion: '0.1', clientInfo: { name: 'node-app', version: '0.0.0' } });
    c.notify('initialized', {});
    return c;
  }

  onEvent(fn: (e: CodexEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  async createThread(workingDirectory = '/home/user'): Promise<string> {
    const res = (await this.request('thread.create', { workingDirectory, skipGitRepoCheck: true })) as { threadId: string };
    return res.threadId;
  }

  async resumeThread(threadId: string): Promise<void> {
    await this.request('thread.resume', { threadId });
  }

  async sendUserMessage(threadId: string, text: string): Promise<void> {
    await this.request('turn.start', { threadId, input: [{ type: 'text', text }] });
  }

  async approve(approvalId: string, decision: 'allow' | 'deny' = 'allow'): Promise<void> {
    this.notify('approval.respond', { approvalId, decision });
  }

  close(): void {
    try {
      this.ws.close();
    } catch {}
  }

  private request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = randomUUID();
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  private notify(method: string, params: unknown): void {
    this.ws.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
  }

  private onMessage(msg: any): void {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
      return;
    }
    const event = mapToCodexEvent(msg);
    if (!event) return;
    if (this.autoApprove && event.type === 'approval.requested') {
      this.approve(event.approvalId, 'allow').catch(() => {});
    }
    for (const fn of this.listeners) fn(event);
  }
}

const mapToCodexEvent = (msg: any): CodexEvent | null => {
  if (!msg || typeof msg !== 'object') return null;
  const method = msg.method as string | undefined;
  const p = msg.params ?? {};
  switch (method) {
    case 'thread.started':
      return { type: 'thread.started', threadId: p.threadId };
    case 'turn.started':
      return { type: 'turn.started', turnId: p.turnId };
    case 'turn.completed':
      return { type: 'turn.completed', turnId: p.turnId };
    case 'turn.failed':
      return { type: 'turn.failed', turnId: p.turnId, error: p.error };
    case 'item.started':
    case 'item.delta':
    case 'item.completed':
      return {
        type: method as 'item.started' | 'item.delta' | 'item.completed',
        itemId: p.itemId,
        kind: p.kind ?? 'message',
        payload: p.payload,
      };
    case 'approval.requested':
      return { type: 'approval.requested', approvalId: p.approvalId, summary: p.summary ?? '' };
    case 'error':
      return { type: 'error', message: p.message ?? 'unknown' };
    default:
      return null;
  }
};

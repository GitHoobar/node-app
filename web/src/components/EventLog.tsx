import clsx from 'clsx';
import { useApp } from '../store';

const summarize = (e: any): { label: string; detail?: string; tone: 'info' | 'warn' | 'error' | 'success' } => {
  if (!e || typeof e !== 'object') return { label: 'event', tone: 'info' };
  const type = e.type as string | undefined;

  if (type === 'log') {
    const tone: 'info' | 'warn' | 'error' = e.level === 'error' ? 'error' : e.level === 'warn' ? 'warn' : 'info';
    return { label: e.level === 'error' ? 'log:err' : e.level === 'warn' ? 'log:warn' : 'log', detail: e.message, tone };
  }
  if (type === 'error') return { label: 'error', detail: e.message, tone: 'error' };

  if (type === 'thread.started') return { label: 'thread', detail: e.threadId?.slice(0, 8), tone: 'info' };
  if (type === 'turn.started') return { label: 'turn.start', tone: 'info' };
  if (type === 'turn.completed') return { label: 'turn.done', tone: 'success' };
  if (type === 'turn.failed') return { label: 'turn.fail', detail: e.error, tone: 'error' };

  if (type === 'item.started' || type === 'item.delta' || type === 'item.completed') {
    const kind = e.kind ?? 'item';
    let detail: string | undefined;
    const p = e.payload as any;
    if (p) {
      if (p.text) detail = String(p.text).slice(0, 200);
      else if (p.command) detail = String(p.command).slice(0, 200);
      else if (p.path) detail = `${p.action ?? ''} ${p.path}`.trim();
      else if (p.changes && Array.isArray(p.changes)) detail = p.changes.map((c: any) => c.path).join(', ');
    }
    return {
      label: type === 'item.completed' ? kind : `${kind}…`,
      detail,
      tone: 'info',
    };
  }

  if (type === 'approval.requested') return { label: 'approval?', detail: e.summary, tone: 'warn' };
  return { label: type ?? 'event', tone: 'info' };
};

const TONE_CLASS: Record<string, string> = {
  info: 'text-emerald-400',
  warn: 'text-amber-300',
  error: 'text-red-400',
  success: 'text-emerald-300 font-semibold',
};

export const EventLog = () => {
  const events = useApp((s) => s.events);
  return (
    <div className="flex h-full flex-col overflow-y-auto p-2 font-mono text-[11px] leading-snug text-zinc-300">
      {events.length === 0 && <div className="p-2 text-zinc-500">no events yet</div>}
      {events.map((it) => {
        const s = summarize(it.event);
        return (
          <div key={it.id} className="border-b border-zinc-900 px-1 py-0.5">
            <span className="text-zinc-500">{new Date(it.ts).toLocaleTimeString()}</span>{' '}
            <span className={clsx(TONE_CLASS[s.tone])}>{s.label}</span>
            {s.detail ? <span className="ml-1 text-zinc-400 whitespace-pre-wrap break-words">— {s.detail}</span> : null}
          </div>
        );
      })}
    </div>
  );
};

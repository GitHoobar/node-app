import { useApp } from '../store';

const labelFor = (e: any): string => {
  if (e.type === 'item.completed' && e.kind === 'file_change') return 'file changed';
  return e.type ?? 'event';
};

export const EventLog = () => {
  const events = useApp((s) => s.events);
  return (
    <div className="flex h-full flex-col overflow-y-auto p-2 font-mono text-[11px] leading-snug text-zinc-300">
      {events.length === 0 && <div className="p-2 text-zinc-500">no events yet</div>}
      {events.map((it) => (
        <div key={it.id} className="border-b border-zinc-900 px-1 py-0.5">
          <span className="text-zinc-500">{new Date(it.ts).toLocaleTimeString()}</span>{' '}
          <span className="text-emerald-400">{labelFor(it.event)}</span>{' '}
          {'kind' in it.event && it.event.kind ? <span className="text-zinc-400">[{String(it.event.kind)}]</span> : null}
        </div>
      ))}
    </div>
  );
};

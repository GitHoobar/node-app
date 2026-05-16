import { type FormEvent, type KeyboardEvent, useState } from 'react';
import clsx from 'clsx';
import { Loader2, Plug, Send } from 'lucide-react';

type Props = {
  busy: boolean;
  sandboxReady: boolean;
  codexConnected: boolean;
  onSubmit: (message: string) => Promise<boolean>;
};

const statusLabel = (busy: boolean, sandboxReady: boolean, codexConnected: boolean): string => {
  if (busy) return 'working';
  if (!codexConnected) return 'connect codex';
  if (!sandboxReady) return 'sandbox starting';
  return 'ready';
};

export const CodexChatComposer = ({ busy, sandboxReady, codexConnected, onSubmit }: Props) => {
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const trimmed = message.trim();
  const blocked = busy || submitting;
  const canSubmit = Boolean(trimmed) && !blocked && (sandboxReady || !codexConnected);
  const isBusy = busy || submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const sent = await onSubmit(trimmed);
      if (sent) setMessage('');
    } finally {
      setSubmitting(false);
    }
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void submit();
  };

  const StatusIcon = isBusy ? Loader2 : codexConnected ? Send : Plug;

  return (
    <form
      onSubmit={onFormSubmit}
      className="mx-auto flex h-full w-full max-w-4xl flex-col justify-end gap-2 px-4 pb-4 pt-3"
    >
      <div className="flex items-center justify-between px-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500">
        <span>Codex</span>
        <span className={clsx(codexConnected && sandboxReady && !isBusy ? 'text-emerald-400' : 'text-zinc-500')}>
          {statusLabel(isBusy, sandboxReady, codexConnected)}
        </span>
      </div>
      <div className="flex min-h-[76px] items-end gap-2 rounded-lg border border-zinc-800 bg-zinc-950/95 p-2 shadow-2xl shadow-black/30">
        <textarea
          aria-label="Codex instruction"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={blocked}
          placeholder="Tell Codex what to change..."
          rows={2}
          className="max-h-28 min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 text-zinc-100 outline-none placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:text-zinc-600"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          title={codexConnected ? 'Send instruction' : 'Connect Codex'}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-emerald-700 bg-emerald-600 text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
        >
          <StatusIcon size={16} className={isBusy ? 'animate-spin' : ''} />
        </button>
      </div>
    </form>
  );
};

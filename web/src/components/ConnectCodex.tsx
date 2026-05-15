import { useEffect, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { getLoginStatus, startLogin } from '../api';

type Props = {
  projectId: string;
  onConnected: () => void;
  onClose: () => void;
};

type Phase = 'preparing' | 'starting' | 'pending' | 'ok' | 'error';

export const ConnectCodex = ({ projectId, onConnected, onClose }: Props) => {
  const [phase, setPhase] = useState<Phase>('starting');
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const polling = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tryStart = async (): Promise<void> => {
      if (cancelled) return;
      try {
        const res = await startLogin(projectId);
        if (cancelled) return;
        if ('error' in res) {
          setError(res.error);
          setPhase('error');
          return;
        }
        if (res.status === 'logged_in') {
          setPhase('ok');
          onConnected();
          return;
        }
        if (res.status === 'preparing') {
          setPhase('preparing');
          setTimeout(tryStart, 3000);
          return;
        }
        setUrl(res.url);
        setCode(res.code);
        setPhase('pending');
      } catch (e) {
        if (cancelled) return;
        setError(String(e));
        setPhase('error');
      }
    };
    tryStart();
    return () => {
      cancelled = true;
    };
  }, [projectId, onConnected]);

  useEffect(() => {
    if (phase !== 'pending') return;
    const tick = async () => {
      const s = await getLoginStatus(projectId).catch(() => ({ loggedIn: false }));
      if (s.loggedIn) {
        setPhase('ok');
        onConnected();
        return;
      }
      polling.current = window.setTimeout(tick, 2500);
    };
    polling.current = window.setTimeout(tick, 2500);
    return () => {
      if (polling.current) window.clearTimeout(polling.current);
    };
  }, [phase, projectId, onConnected]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[440px] rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Connect Codex</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300">
            <X size={16} />
          </button>
        </div>

        {phase === 'starting' && <p className="text-sm text-zinc-400">Starting device authentication…</p>}

        {phase === 'preparing' && (
          <div className="flex flex-col gap-2 text-sm text-zinc-400">
            <p>Spinning up your sandbox and installing Codex (one-time, ~3–5 min)…</p>
            <p className="text-xs text-zinc-500">You can leave this open — we'll detect when it's ready.</p>
          </div>
        )}

        {phase === 'pending' && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-zinc-400">
              Sign in with your ChatGPT account so Codex can run inside this project's sandbox. No OpenAI API key needed.
            </p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-zinc-300">
              <li>
                Open{' '}
                <a
                  href={url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-400 underline-offset-2 hover:underline"
                >
                  {url} <ExternalLink size={12} />
                </a>
              </li>
              <li>
                Enter this code:
                <div className="mt-1 select-all rounded border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-lg tracking-widest">
                  {code}
                </div>
              </li>
              <li>Approve the request. We'll detect it automatically.</li>
            </ol>
          </div>
        )}

        {phase === 'ok' && <p className="text-sm text-emerald-400">Connected — you can close this.</p>}

        {phase === 'error' && (
          <p className="text-sm text-red-400">
            Couldn't start device login: {error}
          </p>
        )}
      </div>
    </div>
  );
};

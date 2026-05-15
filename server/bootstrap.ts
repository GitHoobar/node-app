import type { Sandbox } from 'e2b';

const MARKER = '/home/user/.node-app-bootstrapped';
const LOG = '/tmp/node-app-bootstrap.log';

const exists = async (sandbox: Sandbox, path: string): Promise<boolean> => {
  const r = await sandbox.commands.run(`test -e "${path}" && echo yes || echo no`);
  return r.stdout.trim() === 'yes';
};

const have = async (sandbox: Sandbox, binary: string): Promise<boolean> => {
  const r = await sandbox.commands.run(`command -v ${binary} >/dev/null && echo yes || echo no`);
  return r.stdout.trim() === 'yes';
};

const SHELL_PRELUDE = `export PATH="$HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"`;

export const ensureBootstrapped = async (
  sandbox: Sandbox,
  onLog: (line: string) => void,
): Promise<void> => {
  if (await exists(sandbox, MARKER)) {
    await ensureDevServer(sandbox, onLog);
    return;
  }
  onLog('bootstrapping sandbox (one-time, ~3-5 min)…');

  const step = async (label: string, cmd: string): Promise<void> => {
    onLog(`▸ ${label}`);
    const res = await sandbox.commands.run(
      `bash -lc '${SHELL_PRELUDE}; { ${cmd}; } >> ${LOG} 2>&1'`,
      { timeoutMs: 5 * 60_000 },
    );
    if (res.exitCode !== 0) {
      const tail = await sandbox.commands.run(`tail -40 ${LOG} || true`);
      throw new Error(`bootstrap step failed (${label}): ${tail.stdout}`);
    }
  };

  if (!(await have(sandbox, 'bun'))) {
    await step('install bun', 'curl -fsSL https://bun.sh/install | bash');
  }
  if (!(await have(sandbox, 'node'))) {
    await step('install node (for npm i -g)', 'curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs');
  }
  if (!(await have(sandbox, 'codex'))) {
    await step('install codex CLI', 'npm i -g @openai/codex');
  }

  if (!(await exists(sandbox, '/home/user/package.json'))) {
    await step(
      'scaffold Next.js app',
      'cd /home/user && bun create next-app --app --ts --tailwind --turbopack --yes --use-bun ./.tmp-app && mv ./.tmp-app/* ./.tmp-app/.[!.]* . 2>/dev/null; rm -rf ./.tmp-app',
    );
    await step(
      'init shadcn',
      'cd /home/user && bunx --bun shadcn@latest init -d -y || bunx --bun shadcn@latest init -d',
    );
  }

  await step('mark bootstrapped', `touch ${MARKER}`);
  await ensureDevServer(sandbox, onLog);
};

const ensureDevServer = async (sandbox: Sandbox, onLog: (line: string) => void): Promise<void> => {
  const portCheck = await sandbox.commands.run(
    `bash -c "exec 3<>/dev/tcp/127.0.0.1/3000 && echo up" 2>/dev/null || true`,
  );
  if (portCheck.stdout.includes('up')) return;

  onLog('starting next dev on :3000');
  await sandbox.commands.run(
    `bash -lc '${SHELL_PRELUDE}; cd /home/user && nohup bun --bun run dev --turbo > /tmp/next-dev.log 2>&1 &'`,
    { background: true },
  );

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const r = await sandbox.commands.run(
      `bash -c "exec 3<>/dev/tcp/127.0.0.1/3000 && echo up" 2>/dev/null || true`,
    );
    if (r.stdout.includes('up')) return;
    await Bun.sleep(500);
  }
  throw new Error('next dev did not start within 60s');
};

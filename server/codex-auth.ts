import type { Sandbox } from 'e2b';

const DEVICE_LOG_PATH = '/tmp/codex-login.log';

export type DeviceLoginInfo = { url: string; code: string };

export const startDeviceLogin = async (sandbox: Sandbox): Promise<DeviceLoginInfo> => {
  await sandbox.commands.run(`bash -c "rm -f ${DEVICE_LOG_PATH}"`);
  await sandbox.commands.run(
    `nohup codex login --device-auth > ${DEVICE_LOG_PATH} 2>&1 &`,
    { background: true },
  );

  const TIMEOUT_MS = 30_000;
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const r = await sandbox.commands.run(`cat ${DEVICE_LOG_PATH} 2>/dev/null || true`);
    const parsed = parseDeviceOutput(r.stdout);
    if (parsed) return parsed;
    await Bun.sleep(500);
  }
  const last = await sandbox.commands.run(`cat ${DEVICE_LOG_PATH} 2>/dev/null || echo EMPTY`);
  throw new Error(`codex login did not emit code within ${TIMEOUT_MS / 1000}s. log:\n${last.stdout}`);
};

// ANSI escape sequences (color codes etc.) that codex sprinkles into output
const ANSI_RE = /\[[0-9;]*[A-Za-z]/g;

const parseDeviceOutput = (rawOut: string): DeviceLoginInfo | null => {
  const out = rawOut.replace(ANSI_RE, '');
  const urlMatch = out.match(/https?:\/\/[^\s\]]+/);
  // codex emits codes like XXXX-XXXXX (4 + 5 alphanumeric), but be tolerant
  const codeMatch = out.match(/\b([A-Z0-9]{3,8}-[A-Z0-9]{3,8})\b/);
  if (!urlMatch || !codeMatch) return null;
  return { url: urlMatch[0], code: codeMatch[1]! };
};

export const isLoggedIn = async (sandbox: Sandbox): Promise<boolean> => {
  const r = await sandbox.commands.run('codex login status >/dev/null 2>&1; echo $?');
  return r.stdout.trim() === '0';
};

export const stopDeviceLogin = async (sandbox: Sandbox): Promise<void> => {
  await sandbox.commands.run("pkill -f 'codex login' || true");
};

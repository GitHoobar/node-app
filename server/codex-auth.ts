import type { Sandbox } from 'e2b';

const DEVICE_LOG_PATH = '/tmp/codex-login.log';

export type DeviceLoginInfo = { url: string; code: string };

export const startDeviceLogin = async (sandbox: Sandbox): Promise<DeviceLoginInfo> => {
  await sandbox.commands.run(`rm -f ${DEVICE_LOG_PATH}`);
  await sandbox.commands.run(
    `nohup codex login --device-auth > ${DEVICE_LOG_PATH} 2>&1 &`,
    { background: true },
  );

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const r = await sandbox.commands.run(`cat ${DEVICE_LOG_PATH} 2>/dev/null || true`);
    const parsed = parseDeviceOutput(r.stdout);
    if (parsed) return parsed;
    await Bun.sleep(400);
  }
  throw new Error('codex login --device-auth did not emit a code within 15s');
};

const parseDeviceOutput = (out: string): DeviceLoginInfo | null => {
  const urlMatch = out.match(/https?:\/\/[^\s]+/);
  const codeMatch = out.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/);
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

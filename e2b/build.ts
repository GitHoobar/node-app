import { Template, defaultBuildLogger, waitForURL } from 'e2b';

const template = Template()
  .fromBunImage('1.3')
  .setWorkdir('/home/user/app')
  .runCmd('bun create next-app --app --ts --tailwind --turbopack --yes --use-bun .')
  .runCmd('bunx --bun shadcn@latest init -d')
  .runCmd('bunx --bun shadcn@latest add --all')
  .runCmd(
    "mv /home/user/app/* /home/user/app/.[!.]* /home/user/ 2>/dev/null || true; rm -rf /home/user/app",
  )
  .runCmd('npm i -g @openai/codex')
  .runCmd(
    'mkdir -p /tmp/node-app-codex-sdk-runner && npm install --prefix /tmp/node-app-codex-sdk-runner @openai/codex-sdk@0.130.0 --no-audit --no-fund --loglevel=error',
  )
  .runCmd(
    "cd /home/user && git init -q && git add -A && git -c user.email=bot@local -c user.name=bot commit -q -m 'init'",
  )
  .setWorkdir('/home/user')
  .setStartCmd('bun --bun run dev --turbo', waitForURL('http://localhost:3000'));

await Template.build(template, 'node-app-bun', {
  cpuCount: 4,
  memoryMB: 4096,
  onBuildLogs: defaultBuildLogger(),
});
console.log('template built: node-app-bun');

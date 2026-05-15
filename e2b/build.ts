import { Template, waitForURL } from 'e2b';

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
    "cd /home/user && git init -q && git add -A && git -c user.email=bot@local -c user.name=bot commit -q -m 'init'",
  )
  .setWorkdir('/home/user')
  .setStartCmd('bun --bun run dev --turbo', waitForURL('http://localhost:3000'));

await template.build({ name: 'node-app-bun' });
console.log('template built: node-app-bun');

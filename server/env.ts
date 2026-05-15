const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

export const env = {
  port: Number(process.env.PORT ?? 8787),
  openaiApiKey: required('OPENAI_API_KEY'),
  e2bApiKey: required('E2B_API_KEY'),
  e2bTemplateId: process.env.E2B_TEMPLATE_ID ?? 'node-app-bun',
  databasePath: process.env.DATABASE_PATH ?? './data/node-app.db',
};

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
};

export const env = {
  port: Number(process.env.PORT ?? 8787),
  e2bApiKey: required('E2B_API_KEY'),
  e2bTemplateId: process.env.E2B_TEMPLATE_ID ?? '',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://node_app:node_app@127.0.0.1:54329/node_app',
};

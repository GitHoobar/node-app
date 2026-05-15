import { env } from './config/env.js';
import { createApp } from './app.js';

const app = createApp();

const server = app.listen(env.port, () => {
  console.info(`Server listening on port ${env.port}`);
});

const shutdown = (signal) => {
  console.info(`${signal} received. Closing server.`);
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

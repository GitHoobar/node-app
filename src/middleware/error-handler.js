import { env } from '../config/env.js';

export const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode ?? 500;
  const payload = {
    message: statusCode === 500 ? 'Internal server error' : error.message,
  };

  if (env.nodeEnv !== 'production') {
    payload.stack = error.stack;
  }

  res.status(statusCode).json(payload);
};

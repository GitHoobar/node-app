# Node App

Express API boilerplate using modern Node.js, ESM modules, environment config, linting,
formatting, and tests.

## Requirements

- Node.js 20+
- npm

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The API starts on `http://localhost:3000` by default.

## Scripts

- `npm run dev` - start the API with nodemon
- `npm start` - start the API with Node.js
- `npm test` - run tests once
- `npm run lint` - run ESLint
- `npm run format` - format files with Prettier
- `npm run format:check` - verify formatting

## API

```http
GET /api/health
```

Returns a JSON health response.

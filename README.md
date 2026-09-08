# Sorak API

> Backend REST API for the **Sorak Preschool Child Development and Health Monitoring System** (Trường Mầm non Hòn Tre).

Built with **Node.js 22 LTS**, **Express.js**, **Prisma ORM**, and **PostgreSQL 16**.

---

## 🛠 Tech Stack

- **Runtime**: Node.js 22 LTS (Native ES Modules)
- **Framework**: Express.js 4
- **ORM & Database**: Prisma 6 + PostgreSQL 16
- **Validation**: Joi
- **Authentication**: JWT (httpOnly Cookies + Bearer Token)
- **Logging**: Pino & Pino-HTTP
- **Documentation**: Swagger UI (`/docs`)

---

## 📁 Directory Structure

```
sorak-api/
├── prisma/
│   └── schema.prisma            # Database schema & migrations
├── src/
│   ├── config/                  # Configuration & singletons (env, prisma)
│   ├── controllers/             # Thin HTTP request adapters
│   ├── middlewares/             # Auth, role guard, validation, error handler
│   ├── routes/                  # Express route declarations & apiRouter
│   ├── services/                # Business logic & Prisma transactions
│   ├── utils/                   # Shared utilities (logger, error, pagination)
│   ├── validators/              # Joi validation schemas
│   ├── app.js                   # Application factory
│   └── server.js                # Server entry point
├── ARCHITECTURE.md              # Architectural rules & coding standards
├── .env.example
├── package.json
└── README.md
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for architectural rules, layer definitions, and standard coding patterns.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- npm 10+

### Setup

1. Copy `.env.example` to `.env` and fill in your values:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Generate Prisma client & apply migrations:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

Server will be running at `http://localhost:3000`. Health check available at `http://localhost:3000/health`.

---

## 📜 Available Scripts

- `npm run dev`: Start development server with file watching (`--watch`) and pretty logging.
- `npm start`: Run server in production mode.
- `npm run prisma:generate`: Generate Prisma Client.
- `npm run prisma:migrate`: Run database migrations.
- `npm run format`: Format codebase with Prettier.
- `npm run format:check`: Verify formatting consistency.
- `npm run lint`: Run ESLint checks.

# sorak-api

Backend service for the Sorak preschool management platform. Provides REST APIs for student lifecycle management, attendance tracking, health metrics, curriculum planning, and parent communication.

## Architecture

The service follows a layered architecture pattern:

- **Routes (`src/routes`)**: Define API endpoints and apply middleware.
- **Middlewares (`src/middlewares`)**: Handle authentication, role-based access control (RBAC), request validation, and error formatting.
- **Controllers (`src/controllers`)**: Parse incoming HTTP requests and format standard response envelopes.
- **Services (`src/services`)**: Encapsulate domain logic, external integrations, and Prisma database transactions.
- **Validators (`src/validators`)**: Request payload schema validation using Joi.
- **Config & Database (`src/config`, `prisma`)**: Environment configuration and PostgreSQL schema definitions via Prisma ORM.

## Tech Stack

- **Runtime**: Node.js 22 LTS (ES Modules)
- **Framework**: Express.js 4
- **Database & ORM**: PostgreSQL 16, Prisma ORM 6
- **Validation**: Joi
- **Authentication**: JWT with HTTP-only cookies and refresh token rotation
- **Logging**: Pino / Pino-HTTP

## Core Modules

- **Authentication & Accounts**: JWT authentication, password recovery via email OTP, RBAC authorization (`ADMIN`, `PRINCIPAL_BGH`, `TEACHER_GV`, `PARENT_PH`).
- **Academic Years & Classes**: School years, multi-semester calendar, classroom rosters, age cohort configuration (2-6 years).
- **Teachers & Assignments**: Educator profiles, qualifications, primary/assistant classroom allocations, workload tracking.
- **Students & Admissions**: Student records, enrollment intake pool, classroom allocations, class transfer requests.
- **Curriculum & Planning**: 5 developmental domains, theme and milestone hierarchy, weekly timetable matrices, activity scheduling.
- **Attendance & Dismissal**: Daily check-ins, bus transit tracking, guardian pickup authorizations with identity verification.
- **Health Records**: Vital measurements, WHO-standard BMI percentile calculation, growth history, allergy and medication notes.
- **Assessments & Recognition**: Daily 3-point rubric evaluations, monthly milestones, semester progress summaries, weekly achievement records.
- **Parent Services**: Daily student timeline feeds, leave requests, pickup delegations, teacher consultation feedback.

## Project Structure

```
sorak-api/
├── prisma/
│   ├── schema.prisma        # Database schema definitions
│   └── seed.js              # Initial database seed script
├── src/
│   ├── config/              # App environment and singleton instances
│   ├── controllers/         # Request handlers
│   ├── middlewares/         # Auth, validation, error handling
│   ├── routes/              # Express route declarations
│   ├── services/            # Business and data access logic
│   ├── utils/               # Shared utilities (logger, errors, helpers)
│   ├── validators/          # Joi validation schemas
│   ├── app.js               # Express application setup
│   └── server.js            # Server entrypoint
├── .env.example
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- npm 10+

### Installation & Setup

1. Clone the repository and enter the directory:
   ```bash
   git clone https://github.com/sorak-team/sorak-api.git
   cd sorak-api
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your PostgreSQL connection string and secrets:
   ```env
   PORT=3000
   DATABASE_URL="postgresql://postgres:password@localhost:5432/sorak_db?schema=public"
   JWT_SECRET="your_jwt_secret"
   JWT_REFRESH_SECRET="your_refresh_secret"
   CORS_ORIGIN="http://localhost:5173"
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run database migrations and seed default data:
   ```bash
   npm run prisma:generate
   npm run prisma:migrate
   npm run prisma:seed
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

The API will be available at `http://localhost:3000`. Health check endpoint: `GET /health`.

## Available Scripts

- `npm run dev`: Starts the development server with file watching (`--watch`).
- `npm start`: Runs the server in production mode.
- `npm run prisma:generate`: Generates Prisma Client.
- `npm run prisma:migrate`: Applies database migrations.
- `npm run prisma:seed`: Seeds the database with default records.
- `npm run prisma:studio`: Opens Prisma Studio web UI for database inspection.
- `npm run lint`: Runs ESLint checks.
- `npm run format`: Formats code using Prettier.

## Default Seed Accounts

When seeded, the following test accounts are provisioned with default password `Sorak@2026` (compliant with rule BR_06: >=8 chars, uppercase, digit, special character):

| Role | Username | Description |
| :--- | :--- | :--- |
| Principal / Admin | `ADMIN01` | System configuration, academic years, class transfers |
| Teacher (Primary) | `CB24001` | Homeroom teacher with class management permissions |
| Teacher (Assistant) | `CB25001` | Subject/assistant educator |
| Parent | `HS26001` | Parent portal account linked to enrolled student |

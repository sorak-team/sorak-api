# Sorak API — Architecture & Coding Standards

> **Single source of truth** for backend engineering across the Sorak team.
> Strict consistency is enforced across all routes, controllers, services, and models.

---

## 1. Architectural Style: 4-Tier Layered Architecture

```
HTTP Request
     │
     ▼
[routes/<feature>.routes.js]      ── Route mounting, authMiddleware, requireRoles, validate(schema)
     │
     ▼
[controllers/<feature>.controller.js] ── Thin adapter: req params/body → service call → res.success/paginated
     │
     ▼
[services/<feature>.service.js]   ── Business logic, transactions, HttpError, Prisma queries
     │
     ▼
[Prisma ORM & PostgreSQL]         ── Relational persistence
```

### Layer Responsibilities

| Layer | DOES | NEVER |
| :--- | :--- | :--- |
| **Route** (`src/routes/`) | Declares path endpoints, attaches `authMiddleware`, `requireRoles`, `validate`, wraps with `asyncHandler`. | Business logic, Prisma queries. |
| **Controller** (`src/controllers/`) | Reads `req.params`, `req.query`, `req.body`, `req.user`, invokes service method, calls `res.success()` or `res.paginated()`. | Validation, DB queries, setting cookies directly inside services. |
| **Service** (`src/services/`) | Domain rules, Prisma transactions, throws `HttpError` (`NotFound`, `BadRequest`, etc.). | Reading `req` or sending `res`. |
| **Validator** (`src/validators/`) | Joi schema definitions named `<verb><Noun>Schema` (e.g. `createStudentSchema`). | Any procedural business logic. |
| **Middleware** (`src/middlewares/`) | Cross-cutting concerns (authentication, authorization, logging, error handling, file upload). | Feature-specific business rules. |

---

## 2. Directory Structure

```
sorak-api/
├── prisma/
│   └── schema.prisma            # Datasource, client generator, and entity models
├── src/
│   ├── config/                  # App configuration & singletons (env.js, prisma.js)
│   ├── controllers/             # Thin HTTP controllers (req -> service -> res)
│   ├── middlewares/             # auth, roles, error-handler, request-id, response-wrapper, validate
│   ├── routes/                  # Express route definitions & master router (index.js)
│   ├── services/                # Core domain business logic & Prisma transactions
│   ├── utils/                   # Shared utility modules (logger, http-error, paginate, async-handler)
│   ├── validators/              # Joi validation schemas (<feature>.schema.js)
│   ├── app.js                   # Express application factory & middleware pipeline
│   └── server.js                # Server entry point & graceful shutdown
├── .editorconfig
├── .env.example
├── .gitignore
├── .prettierrc.json
├── ARCHITECTURE.md
├── package.json
└── README.md
```

---

## 3. Standard Patterns & Code Templates

### 3.1 Response Envelope Standard

Always use the standard response helpers provided by `response-wrapper.js`:

- **Single resource / action**:
  ```js
  res.success(data);
  // Returns: { "success": true, "data": { ... } }
  ```
- **Paginated collection**:
  ```js
  res.paginated(result);
  // Returns: { "success": true, "data": [ ... ], "meta": { "page": 1, "pageSize": 20, "total": 100, "totalPages": 5 } }
  ```
- **Never** call raw `res.json()` directly in controllers.

### 3.2 Error Handling Standard

Always throw `HttpError` with user-friendly Vietnamese messages:

```js
import { BadRequest, NotFound, Conflict, Forbidden, Unauthorized } from '../utils/http-error.js';

throw NotFound('Không tìm thấy bản ghi');
throw Conflict('Dữ liệu đã tồn tại trong hệ thống');
throw BadRequest('Thông tin không hợp lệ', validationDetails);
```

### 3.3 Database & Prisma Conventions

1. **Soft Delete**: Always maintain `deleted_at: DateTime?`. Filter `{ deleted_at: null }` in queries.
2. **Naming**: Database table fields are `snake_case` (e.g. `student_id`, `created_at`, `deleted_at`).
3. **Transactions**: Multiple dependent writes must use `prisma.$transaction([...])` or interactive transactions `prisma.$transaction(async (tx) => { ... })`.
4. **Lean Selection**: Always specify `select` or `include` to fetch only required fields. Never return full entity dumps with password hashes.

### 3.4 Language Conventions

- **Code, commits, logs, variable names**: English.
- **User-facing messages (error messages, API notifications)**: Vietnamese.

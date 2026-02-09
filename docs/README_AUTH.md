# Better-Auth Integration

This project uses [better-auth](https://www.better-auth.com/) for authentication, following a strict 3-tier modular architecture.

## Architecture

```
src/
├── config/
│   └── auth.config.ts          # Auth configuration and setup
├── models/
│   └── auth.types.ts           # Type definitions and interfaces
├── repositories/
│   └── auth.repository.ts      # Data access layer
├── services/
│   └── auth.service.ts         # Business logic layer
├── controllers/
│   └── auth.controller.ts      # Presentation layer
├── routes/
│   └── auth.routes.ts          # Route definitions
└── middleware/
    └── auth.middleware.ts      # Authentication middleware
```

## Setup

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Update environment variables:
```env
PORT=3000
AUTH_SECRET=your-secret-key-change-in-production
DATABASE_URL=sqlite://./db.sqlite
```

3. Run the server:
```bash
npm run dev
```

## API Endpoints

### Public Endpoints

**Sign Up**
```
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

**Sign In**
```
POST /api/auth/signin
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### Protected Endpoints (Require Bearer Token)

**Get Profile**
```
GET /api/auth/profile
Authorization: Bearer <token>
```

**Sign Out**
```
POST /api/auth/signout
Authorization: Bearer <token>
```

## Usage Example

```typescript
// Sign up
const signUpResponse = await fetch('http://localhost:3000/api/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123',
    name: 'John Doe'
  })
});

const { session } = await signUpResponse.json();

// Use token for protected routes
const profileResponse = await fetch('http://localhost:3000/api/auth/profile', {
  headers: { 'Authorization': `Bearer ${session.token}` }
});
```

## Protecting Routes

Use the `requireAuth` middleware to protect routes:

```typescript
import { requireAuth } from './middleware/auth.middleware';

router.get('/protected', requireAuth, (req, res) => {
  // req.user and req.session are available
  res.json({ user: req.user });
});
```

## Architecture Benefits

- **Separation of Concerns**: Each layer has a single responsibility
- **Testability**: Layers can be tested independently
- **Maintainability**: Changes are isolated to specific layers
- **Reusability**: Services can be used across different controllers
- **Type Safety**: Full TypeScript support with proper interfaces

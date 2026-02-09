# Express Backend with Prisma

A modular 3-tier Express.js backend with Prisma ORM.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Configure your database:
   - Update `prisma.config.ts` with your DATABASE_URL
   - Or set it in `.env` file

3. Define your models in `prisma/schema.prisma`

4. Generate Prisma Client:
```bash
bun run prisma:generate
```

5. Run migrations:
```bash
bun run prisma:migrate
```

## Development

```bash
bun run dev
```

## Prisma Commands

- `bun run prisma:generate` - Generate Prisma Client
- `bun run prisma:migrate` - Run database migrations
- `bun run prisma:studio` - Open Prisma Studio (database GUI)
- `bun run prisma:push` - Push schema changes to database (without migrations)

## Architecture

This project follows a strict 3-tier architecture:

- **Controllers** (`src/controllers/`) - Handle HTTP requests
- **Services** (`src/services/`) - Business logic
- **Repositories** (`src/repositories/`) - Data access with Prisma

All repositories extend `BaseRepository` which provides access to the Prisma client.

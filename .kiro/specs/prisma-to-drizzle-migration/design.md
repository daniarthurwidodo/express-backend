# Design Document: Prisma to Drizzle ORM Migration

## Overview

This design outlines the migration strategy from Prisma ORM to Drizzle ORM while preserving all existing functionality. The migration maintains the ConnectionManager singleton pattern, retry logic, error handling, and 3-tier architecture. The approach is to replace Prisma components with Drizzle equivalents while keeping the same interfaces and behavior.

### Migration Strategy

1. **Client Replacement**: Replace PrismaClient with Drizzle's postgres client (node-postgres driver with Drizzle wrapper)
2. **Schema Migration**: Convert Prisma schema to Drizzle schema definition
3. **Connection Management**: Adapt ConnectionManager to use Drizzle's connection patterns
4. **Repository Updates**: Update BaseRepository and derived repositories to use Drizzle client
5. **Dependency Cleanup**: Remove all Prisma dependencies and artifacts

### Key Design Decisions

- **Use drizzle-orm with node-postgres**: Drizzle works with the existing `pg` driver, providing a lightweight ORM layer
- **Maintain singleton pattern**: ConnectionManager remains a singleton managing the database connection pool
- **Preserve all interfaces**: External interfaces (ConnectionResult, ConnectionStatus, etc.) remain unchanged
- **Keep retry logic intact**: All connection retry, timeout, and reconnection logic is preserved
- **Schema-first approach**: Define schema in TypeScript using Drizzle's schema builder

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (Controllers, Services - unchanged by migration)            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Data Access Layer                           │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           BaseRepository (Updated)                    │  │
│  │  - protected readonly db: DrizzleClient              │  │
│  │  - Provides Drizzle client to subclasses             │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │      ConnectionManager (Adapted for Drizzle)         │  │
│  │  - Singleton pattern                                  │  │
│  │  - Manages Pool from 'pg'                            │  │
│  │  - Wraps with drizzle() function                     │  │
│  │  - Retry logic, reconnection, graceful shutdown      │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              PostgreSQL Database                             │
└─────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

**Data Access Layer (Repositories)**
- Use Drizzle client for queries
- Implement data operations using Drizzle query builder
- No business logic

**Configuration Layer (ConnectionManager)**
- Manage pg.Pool lifecycle
- Wrap pool with Drizzle
- Handle connection validation, retry, and recovery
- Provide Drizzle client instance to repositories

**Utility Layer**
- URL validation (unchanged)
- Error categorization (updated for Drizzle errors)
- Logging and sanitization (unchanged)

## Components and Interfaces

### 1. Database Client

**Current (Prisma)**
```typescript
import { PrismaClient } from '../generated/prisma/client';
const prisma = new PrismaClient(options);
await prisma.$connect();
await prisma.$disconnect();
```

**New (Drizzle)**
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10, // connection pool size
});

const db = drizzle(pool);

// Connection test
await pool.query('SELECT 1');

// Cleanup
await pool.end();
```

### 2. ConnectionManager Updates

**State Interface**
```typescript
interface ConnectionState {
  pool: Pool | null;              // pg Pool instead of PrismaClient
  dbClient: DrizzleClient | null; // Drizzle-wrapped client
  connected: boolean;
  lastConnectedAt: Date | null;
  lastError: Error | null;
  retryCount: number;
  reconnectTimer: NodeJS.Timeout | null;
}
```

**Key Methods**

- `initializeConnection()`: Creates Pool, wraps with Drizzle, tests connection
- `getDbClient()`: Returns Drizzle client (replaces getPrismaClient)
- `disconnect()`: Calls pool.end() with timeout
- `reconnect()`: Recreates pool and tests connection
- `isConnected()`: Returns connection status
- `getConnectionStatus()`: Returns status details

**Connection Testing**

Drizzle doesn't have a `$connect()` method. Instead, we test connection by executing a simple query:

```typescript
await pool.query('SELECT 1');
```

This validates that the connection pool can establish connections to PostgreSQL.

### 3. BaseRepository Updates

**Current**
```typescript
export abstract class BaseRepository {
  protected readonly prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }
}
```

**New**
```typescript
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type DrizzleClient = NodePgDatabase<typeof schema>;

export abstract class BaseRepository {
  protected readonly db: DrizzleClient;

  constructor() {
    const client = getDbClient();
    if (!client) {
      throw new Error('Database client not initialized');
    }
    this.db = client;
  }
}
```

### 4. Schema Definition

**Current (Prisma)**
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// Models would be defined here
```

**New (Drizzle)**
```typescript
// src/db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Example table definition (if schema has models)
// export const users = pgTable('users', {
//   id: serial('id').primaryKey(),
//   email: text('email').notNull().unique(),
//   name: text('name'),
//   createdAt: timestamp('created_at').defaultNow(),
// });

// Export empty schema object if no tables yet
export const schema = {};
```

**Drizzle Configuration**
```typescript
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

### 5. Type Definitions Updates

**database.types.ts Changes**

```typescript
// Remove Prisma import
// import { PrismaClient } from '../generated/prisma/client';

// Add Drizzle types
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type DrizzleClient = NodePgDatabase<typeof schema>;

// Update ConnectionState
export interface ConnectionState {
  pool: Pool | null;              // Changed from prismaClient
  dbClient: DrizzleClient | null; // Added Drizzle client
  connected: boolean;
  lastConnectedAt: Date | null;
  lastError: Error | null;
  retryCount: number;
  reconnectTimer: NodeJS.Timeout | null;
}

// Update IConnectionManager
export interface IConnectionManager {
  initializeConnection(): Promise<ConnectionResult>;
  getDbClient(): DrizzleClient | null;  // Changed from getPrismaClient
  isConnected(): boolean;
  getConnectionStatus(): ConnectionStatus;
  disconnect(): Promise<void>;
  reconnect(): Promise<ConnectionResult>;
}

// All other interfaces remain unchanged
```

### 6. Error Handling Updates

**Drizzle Error Patterns**

Drizzle uses the underlying pg driver, so most errors come from node-postgres. Update `categorizeError` to handle:

- **Postgres error codes**: Already handled (28P01 for auth, 3D000 for missing DB)
- **Remove Prisma-specific checks**: Remove checks for "Prisma" in error messages
- **Add Drizzle-specific checks**: Check for "drizzle" in error messages for schema issues

```typescript
// Update in categorizeError function
if (message.includes('drizzle') || message.includes('schema')) {
  return new DatabaseError(
    message,
    'SCHEMA_ERROR',
    'permanent',
    [
      'Run: npm run db:generate',
      'Run: npm run db:migrate',
      'Check if Drizzle schema is up to date',
      'Verify database schema matches Drizzle schema'
    ]
  );
}
```

## Data Models

### Connection Pool Configuration

```typescript
interface PoolConfig {
  connectionString: string;
  max?: number;              // Maximum pool size (default: 10)
  idleTimeoutMillis?: number; // Close idle clients after ms (default: 10000)
  connectionTimeoutMillis?: number; // Return error after ms if no connection available (default: 0)
}
```

### Drizzle Client Type

```typescript
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export type DrizzleClient = NodePgDatabase<typeof schema>;
```

This type represents the Drizzle-wrapped database client that provides query builder methods.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Connection Manager Singleton Consistency

*For any* sequence of calls to `ConnectionManager.getInstance()`, all calls should return the same instance reference.

**Validates: Requirements 2.1**

### Property 2: Connection Retry Exponential Backoff

*For any* connection attempt sequence with N retries, the delay before attempt i should equal baseDelay * 2^(i-1), where i ranges from 1 to N.

**Validates: Requirements 2.4**

### Property 3: Database URL Validation Preservation

*For any* database URL string, the validation result from `validateDatabaseUrl()` should be identical before and after migration (same valid/invalid determination and error messages).

**Validates: Requirements 2.3, 11.2**

### Property 4: Error Categorization Consistency

*For any* network-related error (ETIMEDOUT, ECONNREFUSED, ENOTFOUND), the `categorizeError()` function should categorize it as temporary with appropriate troubleshooting steps.

**Validates: Requirements 3.1, 3.2**

### Property 5: Graceful Disconnect Timeout

*For any* disconnect operation, if the underlying connection cleanup exceeds DISCONNECT_TIMEOUT (5000ms), the operation should complete within the timeout period and update connection state.

**Validates: Requirements 2.5**

### Property 6: Reconnection Timer Behavior

*For any* failed connection state, the system should attempt reconnection at RECONNECT_INTERVAL (30000ms) intervals until connection is restored.

**Validates: Requirements 2.6**

### Property 7: Connection State Consistency

*For any* successful connection, the ConnectionState should have connected=true, lastConnectedAt set to current time, lastError=null, and a non-null database client.

**Validates: Requirements 2.7**

### Property 8: Repository Client Access

*For any* repository extending BaseRepository, the repository should have access to a non-null Drizzle client instance after construction when ConnectionManager is initialized.

**Validates: Requirements 4.4**

### Property 9: Type Definition Completeness

*For any* interface in database.types.ts (ConnectionResult, ConnectionStatus, ValidationResult, DatabaseHealthResult, SystemHealthResult, DatabaseError), the interface structure and fields should remain unchanged after migration.

**Validates: Requirements 6.4, 6.5**

### Property 10: Utility Function Preservation

*For any* input to utility functions (sleep, validateDatabaseUrl, sanitizeUrl), the function behavior and output should be identical before and after migration.

**Validates: Requirements 11.1, 11.2, 11.3, 11.5**

### Property 11: Connection Test Equivalence

*For any* database connection state, testing connectivity by executing `SELECT 1` should provide equivalent validation to Prisma's `$connect()` method.

**Validates: Requirements 9.1, 9.3**

### Property 12: Export Function Compatibility

*For any* code using legacy exports (getConnectionManager, disconnectDatabase), the functions should continue to work with identical behavior after migration.

**Validates: Requirements 10.2, 10.3, 10.5**

## Error Handling

### Error Categories

All existing error categories are preserved:

1. **NETWORK_ERROR** (temporary): Connection timeouts, refused connections, host unreachable
2. **POOL_EXHAUSTED** (temporary): Connection pool timeout, too many connections
3. **DNS_ERROR** (temporary): DNS resolution failures
4. **AUTH_FAILED** (permanent): Authentication failures, invalid credentials
5. **DATABASE_NOT_FOUND** (permanent): Database does not exist
6. **SSL_ERROR** (permanent): SSL/TLS configuration issues
7. **SCHEMA_ERROR** (permanent): Schema or migration issues (updated for Drizzle)
8. **UNKNOWN_ERROR** (temporary): Unknown errors default to retryable

### Error Handling Strategy

**Connection Errors**
- Categorize using `categorizeError()`
- Apply retry logic for temporary errors
- Log with structured format including troubleshooting steps
- Update connection state with error details

**Schema Errors**
- Detect Drizzle-specific error patterns
- Provide Drizzle-specific troubleshooting (db:generate, db:migrate)
- Treat as permanent (non-retryable)

**Pool Errors**
- Handle pool exhaustion with appropriate error category
- Provide guidance on pool configuration
- Treat as temporary (retryable)

### Error Propagation

Errors propagate through layers:
1. **pg Pool**: Throws connection/query errors
2. **ConnectionManager**: Catches, categorizes, logs, and either retries or returns error
3. **Repository**: Receives error from client operations
4. **Service**: Handles business logic errors
5. **Controller**: Converts to HTTP responses

## Testing Strategy

### Unit Testing Approach

**Connection Manager Tests**
- Test singleton pattern enforcement
- Test connection initialization with valid/invalid URLs
- Test retry logic with mocked failures
- Test graceful disconnect with timeout
- Test reconnection timer behavior
- Test connection status reporting

**Error Categorization Tests**
- Test each error category with representative error messages
- Test Drizzle-specific error detection
- Test troubleshooting step generation
- Test temporary vs permanent categorization

**Utility Function Tests**
- Test URL validation with various formats
- Test URL sanitization
- Test sleep function timing
- Test error categorization edge cases

**Repository Tests**
- Test BaseRepository client access
- Test error handling when client not initialized
- Test derived repository patterns

### Property-Based Testing

Each correctness property should be implemented as a property-based test with minimum 100 iterations:

- **Property 1**: Generate multiple getInstance() calls, verify same reference
- **Property 2**: Generate retry sequences, verify exponential backoff timing
- **Property 3**: Generate various URL formats, verify validation consistency
- **Property 4**: Generate network errors, verify categorization
- **Property 5**: Test disconnect with various timing scenarios
- **Property 6**: Test reconnection timer with time-based assertions
- **Property 7**: Test connection state after successful connections
- **Property 8**: Test repository instantiation with various states
- **Property 9**: Verify type definitions structurally match
- **Property 10**: Generate inputs for utility functions, verify output consistency
- **Property 11**: Test connection validation equivalence
- **Property 12**: Test legacy export functions

### Integration Testing

**Database Connection Flow**
- Test full connection lifecycle: initialize → use → disconnect
- Test connection recovery after database restart
- Test connection pool behavior under load
- Test concurrent connection requests

**Repository Integration**
- Test repository operations with real Drizzle client
- Test transaction handling (if applicable)
- Test query execution and result mapping

### Migration Validation

**Pre-Migration Checklist**
- Document current Prisma behavior
- Capture connection metrics
- Record error handling patterns
- List all Prisma usage locations

**Post-Migration Verification**
- Verify all tests pass
- Verify connection retry behavior matches
- Verify error messages are appropriate
- Verify no Prisma references remain
- Verify application starts and connects successfully

## Implementation Notes

### Migration Order

1. **Add Drizzle dependencies** (drizzle-orm, drizzle-kit)
2. **Create schema file** (src/db/schema.ts)
3. **Create Drizzle config** (drizzle.config.ts)
4. **Update database.types.ts** (type definitions)
5. **Update ConnectionManager** (client replacement)
6. **Update BaseRepository** (client access)
7. **Update error handling** (Drizzle patterns)
8. **Update package.json scripts** (remove Prisma, add Drizzle)
9. **Remove Prisma dependencies and files**
10. **Update documentation and comments**

### Backward Compatibility

**Export Naming**
- Consider keeping `getPrismaClient` name but returning Drizzle client (with deprecation comment)
- Or rename to `getDbClient` and update all usage
- Recommendation: Rename to `getDbClient` for clarity

**Interface Stability**
- All public interfaces remain stable
- Internal implementation changes are transparent to consumers

### Configuration

**Environment Variables** (unchanged)
- `DATABASE_URL`: PostgreSQL connection string
- `DB_MAX_RETRIES`: Maximum retry attempts (default: 5)
- `DB_RETRY_BASE_DELAY`: Base delay for exponential backoff (default: 1000ms)
- `NODE_ENV`: Environment mode (affects logging)

**Pool Configuration** (new)
```typescript
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
};
```

### Drizzle Kit Commands

```json
{
  "db:generate": "drizzle-kit generate:pg",
  "db:migrate": "drizzle-kit push:pg",
  "db:push": "drizzle-kit push:pg",
  "db:studio": "drizzle-kit studio"
}
```

These replace the Prisma equivalents:
- `prisma:generate` → `db:generate`
- `prisma:migrate` → `db:migrate`
- `prisma:push` → `db:push`
- `prisma:studio` → `db:studio`

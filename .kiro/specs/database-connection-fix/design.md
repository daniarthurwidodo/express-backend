# Design Document: Database Connection Fix

## Overview

This design addresses the database connection failure by implementing a robust connection management system with retry logic, health monitoring, and graceful degradation. The solution follows the project's 3-tier architecture, placing connection management in the data access layer while exposing health checks through the presentation layer.

### Current Issues

1. **Misconfigured DATABASE_URL**: The `.env` file contains a Prisma Postgres URL (`prisma+postgres://localhost:51213/`) but the Prisma Postgres service is not running
2. **No retry logic**: The application attempts connection once and logs an error without retry
3. **No health monitoring**: No way to check database status after startup
4. **Poor error messages**: Generic error messages don't guide troubleshooting
5. **Synchronous connection check**: Blocks startup unnecessarily

### Solution Approach

The design implements a connection manager that:
- Validates and uses the correct Docker PostgreSQL URL
- Retries connections with exponential backoff
- Allows the application to start even if database is unavailable
- Provides health check endpoints for monitoring
- Maintains a singleton Prisma client instance
- Handles graceful shutdown properly

## Architecture

### Component Diagram

```mermaid
graph TB
    subgraph "Presentation Layer"
        HC[Health Check Controller]
        MW[Database Middleware]
    end
    
    subgraph "Business Layer"
        HS[Health Service]
    end
    
    subgraph "Data Access Layer"
        CM[Connection Manager]
        PC[Prisma Client]
        CV[Config Validator]
    end
    
    subgraph "External"
        DB[(PostgreSQL Database)]
        ENV[Environment Variables]
    end
    
    HC --> HS
    MW --> CM
    HS --> CM
    CM --> PC
    CM --> CV
    CV --> ENV
    PC --> DB
    
    style CM fill:#e1f5ff
    style HC fill:#fff4e1
    style HS fill:#e8f5e9
```

### Connection Flow

```mermaid
sequenceDiagram
    participant App as Application
    participant CM as Connection Manager
    participant PC as Prisma Client
    participant DB as PostgreSQL
    
    App->>CM: Initialize connection
    CM->>CM: Validate DATABASE_URL
    
    loop Retry up to 5 times
        CM->>PC: Attempt $connect()
        PC->>DB: Connect
        alt Connection successful
            DB-->>PC: Connected
            PC-->>CM: Success
            CM-->>App: Connection ready
        else Connection failed
            DB-->>PC: Error
            PC-->>CM: Connection error
            CM->>CM: Wait (exponential backoff)
        end
    end
    
    alt All retries exhausted
        CM-->>App: Continue startup (degraded mode)
    end
    
    App->>App: Start HTTP server
```

## Components and Interfaces

### 1. Connection Manager (Data Access Layer)

**File**: `src/config/database.ts`

**Responsibilities**:
- Manage Prisma Client singleton instance
- Implement connection retry logic with exponential backoff
- Validate DATABASE_URL configuration
- Provide connection status information
- Handle graceful disconnection

**Interface**:

```typescript
interface ConnectionManager {
  // Initialize connection with retry logic
  initializeConnection(): Promise<ConnectionResult>;
  
  // Get the Prisma client instance
  getPrismaClient(): PrismaClient | null;
  
  // Check if database is currently connected
  isConnected(): boolean;
  
  // Get connection status details
  getConnectionStatus(): ConnectionStatus;
  
  // Disconnect gracefully
  disconnect(): Promise<void>;
  
  // Attempt to reconnect
  reconnect(): Promise<ConnectionResult>;
}

interface ConnectionResult {
  success: boolean;
  message: string;
  attemptCount?: number;
  error?: Error;
}

interface ConnectionStatus {
  connected: boolean;
  lastConnectedAt?: Date;
  lastError?: string;
  retryCount: number;
  databaseUrl: string; // Sanitized (no credentials)
}
```

**Key Methods**:

```typescript
// Retry logic with exponential backoff
async function connectWithRetry(
  maxRetries: number = 5,
  baseDelay: number = 1000
): Promise<ConnectionResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await prisma.$connect();
      return { success: true, message: 'Connected', attemptCount: attempt };
    } catch (error) {
      if (attempt === maxRetries) {
        return { 
          success: false, 
          message: 'Max retries exhausted',
          attemptCount: attempt,
          error: error as Error
        };
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }
}

// Validate DATABASE_URL format
function validateDatabaseUrl(url: string): ValidationResult {
  if (!url) {
    return { valid: false, error: 'DATABASE_URL is not set' };
  }
  
  // Check for common misconfigurations
  if (url.startsWith('prisma+postgres://')) {
    return { 
      valid: false, 
      error: 'Prisma Postgres URL detected. Use standard PostgreSQL URL for Docker setup.'
    };
  }
  
  // Validate PostgreSQL URL format
  const postgresUrlPattern = /^postgresql:\/\/.+:.+@.+:\d+\/.+$/;
  if (!postgresUrlPattern.test(url)) {
    return {
      valid: false,
      error: 'Invalid PostgreSQL URL format. Expected: postgresql://user:password@host:port/database'
    };
  }
  
  return { valid: true };
}

// Sanitize URL for logging (remove credentials)
function sanitizeUrl(url: string): string {
  return url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
}
```

### 2. Health Check Controller (Presentation Layer)

**File**: `src/controllers/health.controller.ts`

**Responsibilities**:
- Handle HTTP requests for health checks
- Return appropriate status codes and response bodies
- Delegate to Health Service for business logic

**Interface**:

```typescript
class HealthController {
  constructor(private healthService: HealthService) {}
  
  // GET /health/db
  async checkDatabaseHealth(req: Request, res: Response): Promise<void>;
  
  // GET /health (overall health including database)
  async checkOverallHealth(req: Request, res: Response): Promise<void>;
}
```

**Response Format**:

```typescript
// Success response (200)
{
  status: 'healthy',
  database: {
    connected: true,
    responseTime: 15, // milliseconds
    lastConnectedAt: '2024-01-15T10:30:00Z'
  },
  timestamp: '2024-01-15T10:30:15Z'
}

// Failure response (503)
{
  status: 'unhealthy',
  database: {
    connected: false,
    error: 'Connection timeout',
    lastError: 'Connection refused',
    retryCount: 5
  },
  timestamp: '2024-01-15T10:30:15Z'
}
```

### 3. Health Service (Business Layer)

**File**: `src/services/health.service.ts`

**Responsibilities**:
- Perform database health checks
- Measure response time
- Format health check results
- Implement business logic for health determination

**Interface**:

```typescript
interface HealthService {
  // Check database connectivity with ping
  checkDatabaseHealth(): Promise<DatabaseHealthResult>;
  
  // Get overall system health
  getSystemHealth(): Promise<SystemHealthResult>;
}

interface DatabaseHealthResult {
  connected: boolean;
  responseTime?: number;
  error?: string;
  lastConnectedAt?: Date;
}

interface SystemHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: DatabaseHealthResult;
  timestamp: Date;
}
```

**Key Methods**:

```typescript
async function checkDatabaseHealth(): Promise<DatabaseHealthResult> {
  const connectionManager = getConnectionManager();
  
  if (!connectionManager.isConnected()) {
    return {
      connected: false,
      error: 'Database not connected',
      ...connectionManager.getConnectionStatus()
    };
  }
  
  try {
    const startTime = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;
    
    return {
      connected: true,
      responseTime,
      lastConnectedAt: new Date()
    };
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

### 4. Database Middleware (Presentation Layer)

**File**: `src/middleware/database.middleware.ts`

**Responsibilities**:
- Check database availability before processing requests
- Return 503 for database-dependent endpoints when database is unavailable
- Allow non-database endpoints to function normally

**Interface**:

```typescript
// Middleware to check database availability
function requireDatabase(req: Request, res: Response, next: NextFunction): void;

// Middleware to add database status to request context
function attachDatabaseStatus(req: Request, res: Response, next: NextFunction): void;
```

**Usage**:

```typescript
// Apply to database-dependent routes
router.post('/api/users', requireDatabase, userController.createUser);

// Apply globally to add status to all requests
app.use(attachDatabaseStatus);
```

## Data Models

### Connection State

The connection manager maintains internal state:

```typescript
interface ConnectionState {
  prismaClient: PrismaClient | null;
  connected: boolean;
  lastConnectedAt: Date | null;
  lastError: Error | null;
  retryCount: number;
  reconnectTimer: NodeJS.Timeout | null;
}
```

### Configuration

Environment variables required:

```typescript
interface DatabaseConfig {
  DATABASE_URL: string;           // PostgreSQL connection string
  DB_CONNECTION_TIMEOUT?: number; // Default: 10000ms
  DB_MAX_RETRIES?: number;        // Default: 5
  DB_RETRY_BASE_DELAY?: number;   // Default: 1000ms
  DB_POOL_SIZE?: number;          // Default: 10
}
```

## Correctness Properties


*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Environment Variable Reading

*For any* set of environment variables containing DATABASE_URL, the Connection Manager should correctly read and use the DATABASE_URL value for connection configuration.

**Validates: Requirements 1.1**

### Property 2: URL Format Validation with Descriptive Errors

*For any* connection URL string, the Connection Manager should correctly validate the format and, when invalid, provide a descriptive error message indicating the expected format and the specific validation failure.

**Validates: Requirements 1.4, 1.5**

### Property 3: Retry with Exponential Backoff

*For any* connection failure scenario, the Connection Manager should retry up to the configured maximum (5 times) with exponential backoff, where each retry delay is double the previous delay starting from the base delay (1 second).

**Validates: Requirements 2.2, 2.3**

### Property 4: Graceful Degradation on Connection Failure

*For any* database connection failure after all retries, the application should continue starting the HTTP server and remain accessible on the configured port.

**Validates: Requirements 3.1**

### Property 5: Database-Dependent Endpoint Protection

*For any* HTTP endpoint marked as database-dependent, when the database is not connected, the endpoint should return a 503 Service Unavailable status code.

**Validates: Requirements 3.4**

### Property 6: Background Reconnection Attempts

*For any* disconnected database state, the application should periodically attempt to reconnect in the background at the configured interval without blocking the main application thread.

**Validates: Requirements 3.5**

### Property 7: Health Check Response Time Inclusion

*For any* health check request to `/health/db`, when the database is connected, the response should include the measured response time in milliseconds for the database ping operation.

**Validates: Requirements 4.4**

### Property 8: Credential Sanitization in Health Responses

*For any* connection URL containing credentials (username and password), the health check endpoint response should return a sanitized version that does not expose the password or other sensitive authentication information.

**Validates: Requirements 4.5**

### Property 9: Singleton Database Client Instance

*For any* number of calls to get the database client, the Connection Manager should return the same single instance of the Prisma Client throughout the application lifecycle.

**Validates: Requirements 5.1, 5.2**

### Property 10: Graceful Disconnect with Timeout

*For any* set of pending database queries during shutdown, the Connection Manager should wait for their completion up to the configured timeout before forcing disconnection.

**Validates: Requirements 5.4**

### Property 11: Error Logging with Context and Categorization

*For any* connection error that occurs, the Connection Manager should log the error with full context (error type, message, stack trace) and correctly categorize it as either temporary (retryable) or permanent (non-retryable).

**Validates: Requirements 6.1, 6.5**

## Error Handling

### Error Categories

**Temporary Errors (Retryable)**:
- Network timeouts (`ETIMEDOUT`, `ECONNREFUSED`)
- Connection pool exhausted
- Database temporarily unavailable
- DNS resolution failures

**Permanent Errors (Non-Retryable)**:
- Authentication failures (`28P01`)
- Database does not exist (`3D000`)
- Invalid connection string format
- SSL/TLS configuration errors
- Unsupported database version

### Error Response Format

```typescript
class DatabaseError extends Error {
  constructor(
    message: string,
    public code: string,
    public category: 'temporary' | 'permanent',
    public troubleshooting?: string[]
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Example usage
throw new DatabaseError(
  'Connection timeout',
  'ETIMEDOUT',
  'temporary',
  [
    'Check if PostgreSQL container is running: docker ps',
    'Verify network connectivity to database host',
    'Check firewall rules for port 5432'
  ]
);
```

### Error Handling Strategy

```mermaid
flowchart TD
    A[Connection Error] --> B{Categorize Error}
    B -->|Temporary| C[Log with retry info]
    B -->|Permanent| D[Log with troubleshooting]
    
    C --> E{Retries remaining?}
    E -->|Yes| F[Wait exponential backoff]
    E -->|No| G[Log final error]
    
    F --> H[Retry connection]
    H --> I{Success?}
    I -->|Yes| J[Continue startup]
    I -->|No| A
    
    D --> G
    G --> K[Continue startup in degraded mode]
    
    J --> L[Application ready]
    K --> M[Application ready - degraded]
```

### Logging Standards

All database-related logs should include:
- **Timestamp**: ISO 8601 format
- **Level**: error, warn, info, debug
- **Context**: Operation being performed
- **Error details**: Code, message, category
- **Sanitized URL**: Connection string without credentials
- **Retry information**: Attempt number, remaining retries

Example log output:

```json
{
  "level": "error",
  "time": "2024-01-15T10:30:15.123Z",
  "msg": "Database connection failed",
  "context": "initialization",
  "error": {
    "code": "ECONNREFUSED",
    "message": "connect ECONNREFUSED 127.0.0.1:5432",
    "category": "temporary"
  },
  "connection": {
    "url": "postgresql://***:***@localhost:5432/mydb",
    "attempt": 3,
    "remainingRetries": 2
  },
  "troubleshooting": [
    "Check if PostgreSQL container is running: docker ps",
    "Start the database: docker-compose up -d postgres"
  ]
}
```

## Testing Strategy

### Unit Testing Approach

Unit tests should focus on:

1. **Configuration Validation**:
   - Test URL format validation with various valid/invalid formats
   - Test missing DATABASE_URL handling
   - Test Prisma Postgres URL detection and error message

2. **Error Categorization**:
   - Test specific error codes are categorized correctly
   - Test authentication errors return proper messages without exposing credentials
   - Test network timeout errors include troubleshooting steps

3. **URL Sanitization**:
   - Test credentials are removed from URLs in logs
   - Test various URL formats are sanitized correctly

4. **Singleton Pattern**:
   - Test multiple calls to getPrismaClient return same instance
   - Test client is only created once

5. **Health Check Responses**:
   - Test connected state returns 200 with proper structure
   - Test disconnected state returns 503 with error info
   - Test response includes all required fields

### Property-Based Testing Approach

Property-based tests should verify universal behaviors across many generated inputs. Each test should run a minimum of 100 iterations with randomized inputs.

**Testing Library**: Use `fast-check` for TypeScript property-based testing.

**Property Test Requirements**:
- Each correctness property must be implemented as a property-based test
- Minimum 100 iterations per test
- Tag each test with: `Feature: database-connection-fix, Property {N}: {property title}`
- Tests should generate random valid and invalid inputs

**Example Property Test Structure**:

```typescript
// Feature: database-connection-fix, Property 2: URL Format Validation with Descriptive Errors
describe('Connection URL Validation', () => {
  it('should validate URL format and provide descriptive errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          fc.constant(''),
          fc.constant('prisma+postgres://localhost:51213/db'),
          fc.constant('invalid-url'),
          fc.string(),
          fc.webUrl()
        ),
        async (url) => {
          const result = validateDatabaseUrl(url);
          
          if (!result.valid) {
            // Should have descriptive error message
            expect(result.error).toBeDefined();
            expect(result.error.length).toBeGreaterThan(0);
            
            // Should indicate expected format
            expect(result.error).toMatch(/postgresql:\/\//);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

**Key Property Tests**:

1. **Property 2 - URL Validation**: Generate random strings and valid/invalid URLs, verify validation logic
2. **Property 3 - Exponential Backoff**: Generate random failure scenarios, verify retry timing
3. **Property 8 - Credential Sanitization**: Generate URLs with various credential formats, verify no passwords in output
4. **Property 9 - Singleton**: Call getPrismaClient multiple times, verify same instance
5. **Property 11 - Error Categorization**: Generate various error types, verify correct categorization

### Integration Testing

Integration tests should verify:
- Connection to actual PostgreSQL database
- Retry logic with real connection failures (using testcontainers)
- Health check endpoints with real database
- Graceful shutdown with active connections

### Test Coverage Goals

- Unit test coverage: >80% for connection manager logic
- Property test coverage: All 11 correctness properties implemented
- Integration test coverage: All critical paths (connect, disconnect, health check)

## Implementation Notes

### Configuration Updates Required

**File**: `.env.example`

```env
# Database Configuration
# For Docker PostgreSQL (recommended for local development)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mydb"

# Connection retry settings (optional)
DB_MAX_RETRIES=5
DB_RETRY_BASE_DELAY=1000
DB_CONNECTION_TIMEOUT=10000
DB_POOL_SIZE=10

# For production, use connection pooling
# DATABASE_URL="postgresql://user:password@host:5432/dbname?connection_limit=10&pool_timeout=10"
```

### Startup Sequence

1. Load environment variables
2. Validate DATABASE_URL format
3. Create Prisma Client instance
4. Attempt connection with retry logic
5. Start HTTP server (regardless of database status)
6. If database unavailable, start background reconnection timer
7. Register graceful shutdown handlers

### Background Reconnection Logic

```typescript
const RECONNECT_INTERVAL = 30000; // 30 seconds

function startReconnectionTimer(): void {
  if (reconnectTimer) return; // Already running
  
  reconnectTimer = setInterval(async () => {
    if (isConnected()) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
      return;
    }
    
    logger.info('Attempting background reconnection...');
    const result = await connectWithRetry(3, 2000); // Fewer retries for background
    
    if (result.success) {
      logger.info('Background reconnection successful');
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  }, RECONNECT_INTERVAL);
}
```

### Middleware Implementation Pattern

```typescript
// Apply to specific routes that need database
router.post('/api/users', requireDatabase, userController.createUser);

// Or apply to entire route groups
router.use('/api/users', requireDatabase);
router.use('/api/posts', requireDatabase);

// Health checks should NOT require database
router.get('/health', healthController.checkOverallHealth);
router.get('/health/db', healthController.checkDatabaseHealth);
```

### Dependency Injection Setup

The connection manager should be initialized once and injected into services:

```typescript
// src/index.ts
const connectionManager = new ConnectionManager();
await connectionManager.initializeConnection();

const healthService = new HealthService(connectionManager);
const healthController = new HealthController(healthService);

// Register routes with controller
app.get('/health/db', (req, res) => healthController.checkDatabaseHealth(req, res));
```

## Migration Path

### Step 1: Update Configuration
- Update `.env` file with correct PostgreSQL URL
- Update `.env.example` with documentation
- Add optional retry configuration variables

### Step 2: Implement Connection Manager
- Refactor `src/config/database.ts` with new connection manager
- Add validation, retry logic, and state management
- Implement sanitization and error categorization

### Step 3: Implement Health Service
- Create `src/services/health.service.ts`
- Implement database health check with timing
- Implement system health aggregation

### Step 4: Implement Health Controller
- Create `src/controllers/health.controller.ts`
- Add routes for `/health/db` and update `/health`
- Return appropriate status codes and response formats

### Step 5: Implement Database Middleware
- Create `src/middleware/database.middleware.ts`
- Implement `requireDatabase` middleware
- Apply to database-dependent routes

### Step 6: Update Application Startup
- Modify `src/index.ts` to use new connection manager
- Implement graceful degradation on connection failure
- Add background reconnection timer

### Step 7: Update Documentation
- Update README with database setup instructions
- Document connection retry behavior
- Add troubleshooting guide

## Security Considerations

1. **Credential Protection**: Never log passwords or API keys
2. **URL Sanitization**: Always sanitize URLs before logging or returning in responses
3. **Error Messages**: Provide helpful errors without exposing system internals
4. **Health Endpoints**: Don't expose sensitive configuration in health check responses
5. **Connection Strings**: Use environment variables, never hardcode credentials

## Performance Considerations

1. **Connection Pooling**: Use Prisma's built-in connection pooling (default: 10 connections)
2. **Retry Delays**: Exponential backoff prevents overwhelming the database
3. **Background Reconnection**: Use reasonable intervals (30s) to avoid excessive retry attempts
4. **Health Check Caching**: Consider caching health check results for 5-10 seconds under high load
5. **Graceful Shutdown**: Timeout ensures application doesn't hang indefinitely

## Monitoring and Observability

### Metrics to Track

- Connection success/failure rate
- Average connection time
- Retry count distribution
- Health check response times
- Background reconnection success rate
- Active connection pool size

### Alerts to Configure

- Database connection failures exceeding threshold
- Health check failures
- Connection pool exhaustion
- Slow health check response times (>1s)

### Log Aggregation

All database-related logs should be:
- Structured (JSON format)
- Include correlation IDs for request tracing
- Categorized by severity
- Searchable by error codes and categories

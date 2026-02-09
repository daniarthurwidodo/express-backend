# Requirements Document: Prisma to Drizzle ORM Migration

## Introduction

This document specifies the requirements for migrating the Express backend application from Prisma ORM to Drizzle ORM. The migration must maintain all existing functionality, including connection management, retry logic, error handling, and the 3-tier architecture pattern, while completely removing Prisma dependencies.

## Glossary

- **System**: The Express backend application
- **ConnectionManager**: Singleton class managing database connection lifecycle
- **BaseRepository**: Abstract class providing database client access to repository implementations
- **Drizzle**: The target ORM (Drizzle ORM) for database operations
- **Prisma**: The current ORM being replaced
- **Database_Client**: The database client instance (currently PrismaClient, will become Drizzle client)
- **Retry_Logic**: Exponential backoff mechanism for connection attempts
- **Connection_State**: Internal state tracking connection status and metadata
- **Schema_Definition**: Database schema specification (currently schema.prisma, will become Drizzle schema)

## Requirements

### Requirement 1: Replace Prisma Client with Drizzle Client

**User Story:** As a developer, I want to replace PrismaClient with Drizzle's database client, so that the application uses Drizzle ORM for all database operations.

#### Acceptance Criteria

1. THE System SHALL use Drizzle's PostgreSQL client instead of PrismaClient
2. WHEN the ConnectionManager initializes, THE System SHALL create a Drizzle client instance with appropriate configuration
3. THE System SHALL maintain the same client instantiation pattern (singleton via ConnectionManager)
4. THE System SHALL configure Drizzle client with logging options equivalent to current Prisma configuration
5. THE System SHALL expose the Drizzle client through the same getter methods (getPrismaClient renamed to getDrizzleClient or getDbClient)

### Requirement 2: Preserve Connection Management Architecture

**User Story:** As a system administrator, I want the connection management logic to remain unchanged, so that connection reliability and retry behavior are preserved.

#### Acceptance Criteria

1. THE ConnectionManager SHALL maintain its singleton pattern
2. THE ConnectionManager SHALL preserve all existing methods: initializeConnection, disconnect, reconnect, isConnected, getConnectionStatus
3. WHEN initializing connection, THE System SHALL validate DATABASE_URL using the existing validateDatabaseUrl function
4. WHEN connection fails, THE System SHALL apply the same exponential backoff retry logic with configurable maxRetries and baseDelay
5. WHEN disconnecting, THE System SHALL implement graceful shutdown with the same timeout mechanism (5 seconds)
6. THE System SHALL maintain the background reconnection timer (30-second interval) for automatic recovery
7. THE ConnectionState interface SHALL be updated to reference Drizzle client instead of PrismaClient while preserving all other fields

### Requirement 3: Maintain Error Handling and Categorization

**User Story:** As a developer, I want error handling to work identically, so that error categorization and troubleshooting guidance remain effective.

#### Acceptance Criteria

1. THE categorizeError function SHALL continue to categorize errors as temporary or permanent
2. THE System SHALL update Prisma-specific error detection to handle Drizzle-specific errors
3. WHEN a Drizzle schema or migration error occurs, THE System SHALL provide appropriate troubleshooting steps
4. THE DatabaseError class SHALL remain unchanged
5. THE System SHALL maintain all existing error categories: NETWORK_ERROR, POOL_EXHAUSTED, DNS_ERROR, AUTH_FAILED, DATABASE_NOT_FOUND, SSL_ERROR, SCHEMA_ERROR, UNKNOWN_ERROR

### Requirement 4: Update BaseRepository Pattern

**User Story:** As a developer, I want repositories to use Drizzle client, so that all data access operations use the new ORM.

#### Acceptance Criteria

1. THE BaseRepository class SHALL replace the prisma property with a drizzle or db property
2. THE BaseRepository SHALL obtain the Drizzle client from ConnectionManager
3. THE BaseRepository SHALL maintain the same abstract class pattern for inheritance
4. WHEN a repository extends BaseRepository, THE repository SHALL have access to the Drizzle client instance
5. THE System SHALL update the property type from PrismaClient to the appropriate Drizzle client type

### Requirement 5: Migrate Schema Definition

**User Story:** As a developer, I want the database schema defined in Drizzle format, so that schema management uses Drizzle's tooling.

#### Acceptance Criteria

1. THE System SHALL create a Drizzle schema file (e.g., src/db/schema.ts) to replace prisma/schema.prisma
2. THE Schema_Definition SHALL use Drizzle's schema definition syntax
3. THE Schema_Definition SHALL define the PostgreSQL connection configuration
4. IF the Prisma schema contains models, THE System SHALL convert them to Drizzle table definitions
5. THE System SHALL configure Drizzle to generate TypeScript types from the schema

### Requirement 6: Update Type Definitions

**User Story:** As a developer, I want type definitions updated to reference Drizzle types, so that TypeScript compilation succeeds.

#### Acceptance Criteria

1. THE database.types.ts file SHALL replace PrismaClient imports with Drizzle client imports
2. THE ConnectionState interface SHALL use the Drizzle client type instead of PrismaClient
3. THE IConnectionManager interface SHALL update method signatures to reference Drizzle client
4. THE System SHALL maintain all existing interfaces: ConnectionResult, ConnectionStatus, ValidationResult, DatabaseHealthResult, SystemHealthResult
5. THE System SHALL preserve the DatabaseError class without modifications

### Requirement 7: Remove Prisma Dependencies

**User Story:** As a developer, I want all Prisma dependencies removed, so that the project has no remaining Prisma artifacts.

#### Acceptance Criteria

1. THE System SHALL remove @prisma/client from package.json dependencies
2. THE System SHALL remove prisma from package.json dependencies
3. THE System SHALL remove all Prisma-related scripts from package.json (prisma:generate, prisma:migrate, prisma:studio, prisma:push)
4. THE System SHALL delete the prisma/ directory and schema.prisma file
5. THE System SHALL delete the src/generated/prisma/ directory
6. THE System SHALL remove any .prisma files from the project root

### Requirement 8: Add Drizzle Dependencies and Scripts

**User Story:** As a developer, I want Drizzle dependencies and tooling scripts added, so that I can use Drizzle for development and migrations.

#### Acceptance Criteria

1. THE System SHALL add drizzle-orm to package.json dependencies
2. THE System SHALL add drizzle-kit to package.json devDependencies
3. THE System SHALL add postgres or pg driver dependency if not already present
4. THE System SHALL add npm scripts for Drizzle operations: db:generate, db:migrate, db:push, db:studio
5. THE System SHALL create a drizzle.config.ts file for Drizzle Kit configuration

### Requirement 9: Update Connection Testing

**User Story:** As a developer, I want connection testing to work with Drizzle, so that I can verify database connectivity.

#### Acceptance Criteria

1. WHEN testing connection, THE System SHALL use Drizzle's equivalent of $connect (e.g., execute a simple query)
2. WHEN disconnecting, THE System SHALL use Drizzle's connection cleanup method
3. THE System SHALL maintain the same connection validation approach (attempting a database operation)
4. THE System SHALL preserve all connection retry and timeout behavior
5. THE System SHALL log connection attempts with the same structured logging format

### Requirement 10: Maintain Backward Compatibility for Exports

**User Story:** As a developer, I want legacy export functions to work, so that existing code using these exports continues to function.

#### Acceptance Criteria

1. THE System SHALL update getPrismaClient export to return Drizzle client (or rename to getDbClient with deprecation notice)
2. THE disconnectDatabase export SHALL continue to work with Drizzle
3. THE getConnectionManager export SHALL remain unchanged
4. IF renaming exports, THE System SHALL provide clear migration guidance in code comments
5. THE System SHALL maintain the same module export structure from database.ts

### Requirement 11: Preserve Utility Functions

**User Story:** As a developer, I want utility functions to remain unchanged, so that URL validation and error handling continue to work.

#### Acceptance Criteria

1. THE sleep function SHALL remain unchanged
2. THE validateDatabaseUrl function SHALL remain unchanged
3. THE sanitizeUrl function SHALL remain unchanged
4. THE categorizeError function SHALL be updated only to handle Drizzle-specific error patterns
5. THE System SHALL maintain all existing utility function signatures and behavior

### Requirement 12: Update Documentation and Comments

**User Story:** As a developer, I want code comments updated to reference Drizzle, so that documentation accurately reflects the implementation.

#### Acceptance Criteria

1. WHEN code comments reference Prisma, THE System SHALL update them to reference Drizzle
2. WHEN JSDoc comments describe Prisma Client, THE System SHALL update them to describe Drizzle client
3. THE System SHALL update example code in comments to use Drizzle syntax
4. THE System SHALL maintain the same level of documentation detail
5. THE System SHALL update any README or documentation files that reference Prisma

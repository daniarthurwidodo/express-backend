# Implementation Plan: Prisma to Drizzle ORM Migration

## Overview

This plan outlines the step-by-step migration from Prisma ORM to Drizzle ORM. The migration preserves all existing functionality including connection management, retry logic, error handling, and the 3-tier architecture. Each task builds incrementally to ensure the system remains functional throughout the migration.

## Tasks

- [x] 1. Add Drizzle dependencies and create initial configuration
  - Add drizzle-orm to package.json dependencies
  - Add drizzle-kit to package.json devDependencies
  - Verify pg driver is present in dependencies
  - Create drizzle.config.ts in project root with PostgreSQL configuration
  - Create src/db directory for schema files
  - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [ ] 2. Create Drizzle schema definition
  - [x] 2.1 Create src/db/schema.ts with empty schema export
    - Define schema structure using Drizzle's schema builder
    - Export schema object for type inference
    - Add JSDoc comments explaining schema organization
    - _Requirements: 5.1, 5.2, 5.5_
  
  - [x] 2.2 Add Drizzle npm scripts to package.json
    - Add db:generate script for schema generation
    - Add db:migrate script for migrations
    - Add db:push script for schema push
    - Add db:studio script for Drizzle Studio
    - _Requirements: 8.4_

- [ ] 3. Update type definitions for Drizzle
  - [x] 3.1 Update src/models/database.types.ts
    - Import Pool from 'pg' and Drizzle types
    - Define DrizzleClient type using NodePgDatabase
    - Update ConnectionState interface to use Pool and DrizzleClient
    - Update IConnectionManager interface method signatures
    - Remove PrismaClient imports
    - Preserve all other interfaces unchanged
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 4. Update ConnectionManager for Drizzle
  - [x] 4.1 Update imports and state initialization
    - Replace PrismaClient import with Pool and drizzle imports
    - Update ConnectionState initialization for pool and dbClient
    - Update constants (DISCONNECT_TIMEOUT, RECONNECT_INTERVAL)
    - _Requirements: 1.1, 2.7_
  
  - [x] 4.2 Implement connection initialization with Drizzle
    - Create Pool instance with configuration from DATABASE_URL
    - Wrap Pool with drizzle() function
    - Replace $connect() with pool.query('SELECT 1') for connection testing
    - Maintain retry logic and exponential backoff
    - Update connection state management
    - _Requirements: 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 9.1, 9.3_
  
  - [x] 4.3 Update getDbClient method
    - Rename getPrismaClient to getDbClient (or keep name with deprecation comment)
    - Return DrizzleClient instead of PrismaClient
    - Update JSDoc comments
    - _Requirements: 1.5, 10.1, 12.2_
  
  - [x] 4.4 Update disconnect method for Drizzle
    - Replace prismaClient.$disconnect() with pool.end()
    - Maintain timeout mechanism
    - Update state cleanup for pool and dbClient
    - _Requirements: 2.5, 9.2_
  
  - [x] 4.5 Update reconnect method for Drizzle
    - Recreate Pool instance if needed
    - Wrap with drizzle() function
    - Use pool.query('SELECT 1') for connection testing
    - Maintain retry logic with fewer attempts
    - Update reconnection timer logic
    - _Requirements: 2.6, 9.4_
  
  - [x] 4.6 Update legacy export functions
    - Update getPrismaClient export to return Drizzle client
    - Update disconnectDatabase export to use new disconnect logic
    - Maintain getConnectionManager export
    - Add deprecation comments if renaming
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 5. Update error handling for Drizzle
  - [x] 5.1 Update categorizeError function
    - Remove Prisma-specific error detection
    - Add Drizzle-specific error detection patterns
    - Update SCHEMA_ERROR troubleshooting steps for Drizzle commands
    - Preserve all error categories and logic
    - Maintain PostgreSQL error code handling
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 11.4_

- [ ] 6. Update BaseRepository for Drizzle
  - [x] 6.1 Update src/repositories/base.repository.ts
    - Import DrizzleClient type from database.types
    - Replace prisma property with db property
    - Update constructor to call getDbClient()
    - Add null check and error handling for uninitialized client
    - Update JSDoc comments
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7. Update documentation and comments
  - [x] 7.1 Update code comments in database.ts
    - Replace Prisma references with Drizzle
    - Update JSDoc comments for all methods
    - Update example code in comments
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [x] 7.2 Update code comments in other affected files
    - Update comments in base.repository.ts
    - Update comments in database.types.ts
    - Ensure all documentation reflects Drizzle usage
    - _Requirements: 12.1, 12.4_

- [ ] 8. Checkpoint - Verify Drizzle integration works
  - Ensure all TypeScript compilation succeeds
  - Verify no Prisma imports remain in updated files
  - Test connection initialization manually
  - Ask the user if questions arise

- [ ] 9. Remove Prisma dependencies and artifacts
  - [ ] 9.1 Remove Prisma from package.json
    - Remove @prisma/client from dependencies
    - Remove prisma from dependencies
    - Remove all prisma:* scripts
    - _Requirements: 7.1, 7.2, 7.3_
  
  - [ ] 9.2 Delete Prisma files and directories
    - Delete prisma/ directory
    - Delete src/generated/prisma/ directory
    - Delete any .prisma files in project root
    - _Requirements: 7.4, 7.5, 7.6_

- [ ] 10. Final verification and cleanup
  - [ ] 10.1 Verify no Prisma references remain
    - Search codebase for any remaining Prisma imports
    - Search for any remaining PrismaClient references
    - Verify all files compile without errors
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
  
  - [ ] 10.2 Update README if it exists
    - Replace Prisma setup instructions with Drizzle
    - Update database commands documentation
    - Update any architecture diagrams or documentation
    - _Requirements: 12.5_

- [ ] 11. Final checkpoint - Complete migration verification
  - Run npm install to ensure dependencies are correct
  - Verify application starts without errors
  - Test database connection initialization
  - Verify connection retry logic works
  - Verify graceful disconnect works
  - Ensure all tests pass, ask the user if questions arise

## Notes

- This migration maintains 100% backward compatibility for all public interfaces
- The ConnectionManager singleton pattern is preserved
- All retry logic, timeout handling, and error categorization remain unchanged
- The 3-tier architecture (controllers → services → repositories) is unaffected
- Testing tasks are handled separately per architecture constitution
- Each task builds incrementally to minimize risk
- Checkpoints ensure system stability before proceeding

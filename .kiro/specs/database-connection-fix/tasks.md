# Implementation Plan: Database Connection Fix

## Overview

This implementation plan addresses the database connection failure by building a robust connection management system following the 3-tier architecture. The implementation will proceed layer by layer, starting with the data access layer (connection manager), then business layer (health service), and finally the presentation layer (controllers and middleware). Testing tasks are marked as optional with `*`.

## Tasks

- [x] 1. Update environment configuration files
  - Update `.env` with correct Docker PostgreSQL URL: `postgresql://postgres:postgres@localhost:5432/mydb`
  - Update `.env.example` with documented configuration options and examples
  - Add optional retry configuration variables (DB_MAX_RETRIES, DB_RETRY_BASE_DELAY, etc.)
  - _Requirements: 1.2, 7.1, 7.2, 7.3_

- [ ] 2. Implement connection manager core (Data Access Layer)
  - [x] 2.1 Create TypeScript interfaces and types for connection management
    - Define `ConnectionManager`, `ConnectionResult`, `ConnectionStatus`, `ConnectionState` interfaces
    - Define `DatabaseConfig` interface for environment variables
    - Define `ValidationResult` interface for URL validation
    - Create custom `DatabaseError` class with error categorization
    - _Requirements: 1.1, 6.5_
  
  - [x] 2.2 Implement URL validation and sanitization utilities
    - Write `validateDatabaseUrl()` function to check URL format
    - Detect Prisma Postgres URLs and provide helpful error messages
    - Write `sanitizeUrl()` function to remove credentials from URLs
    - Write `categorizeError()` function to classify errors as temporary/permanent
    - _Requirements: 1.3, 1.4, 1.5, 6.3, 6.5_
  
  - [ ]* 2.3 Write property test for URL validation
    - **Property 2: URL Format Validation with Descriptive Errors**
    - **Validates: Requirements 1.4, 1.5**
  
  - [ ]* 2.4 Write property test for credential sanitization
    - **Property 8: Credential Sanitization in Health Responses**
    - **Validates: Requirements 4.5**
  
  - [x] 2.5 Implement connection retry logic with exponential backoff
    - Write `connectWithRetry()` function with configurable max retries and base delay
    - Implement exponential backoff calculation (delay = baseDelay * 2^(attempt-1))
    - Add sleep utility function for delays
    - Log each retry attempt with context
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [ ]* 2.6 Write property test for exponential backoff timing
    - **Property 3: Retry with Exponential Backoff**
    - **Validates: Requirements 2.2, 2.3**
  
  - [ ] 2.7 Implement ConnectionManager class with state management
    - Create singleton Prisma Client instance
    - Implement `initializeConnection()` with retry logic
    - Implement `getPrismaClient()` to return client or null
    - Implement `isConnected()` to check connection status
    - Implement `getConnectionStatus()` to return detailed status
    - Implement `disconnect()` for graceful shutdown with timeout
    - Implement `reconnect()` for background reconnection
    - Maintain internal connection state
    - _Requirements: 1.1, 3.1, 5.1, 5.2, 5.3, 5.4, 5.5_
  
  - [ ]* 2.8 Write property test for singleton pattern
    - **Property 9: Singleton Database Client Instance**
    - **Validates: Requirements 5.1, 5.2**
  
  - [ ]* 2.9 Write property test for graceful disconnect
    - **Property 10: Graceful Disconnect with Timeout**
    - **Validates: Requirements 5.4**

- [ ] 3. Checkpoint - Verify connection manager implementation
  - Ensure all connection manager tests pass, ask the user if questions arise.

- [ ] 4. Implement health service (Business Logic Layer)
  - [ ] 4.1 Create health service with database health check logic
    - Create `src/services/health.service.ts`
    - Define `HealthService` class with ConnectionManager dependency
    - Implement `checkDatabaseHealth()` method with ping and timing
    - Implement `getSystemHealth()` method for overall health status
    - Use `$queryRaw` to ping database and measure response time
    - Handle connection errors gracefully
    - _Requirements: 4.2, 4.3, 4.4_
  
  - [ ]* 4.2 Write property test for health check response time inclusion
    - **Property 7: Health Check Response Time Inclusion**
    - **Validates: Requirements 4.4**
  
  - [ ]* 4.3 Write unit tests for health service
    - Test health check when database is connected
    - Test health check when database is disconnected
    - Test response time measurement accuracy
    - Test error handling for failed pings

- [ ] 5. Implement health check controller (Presentation Layer)
  - [ ] 5.1 Create health controller with HTTP request handling
    - Create `src/controllers/health.controller.ts`
    - Define `HealthController` class with HealthService dependency
    - Implement `checkDatabaseHealth()` method for `/health/db` endpoint
    - Implement `checkOverallHealth()` method for `/health` endpoint
    - Return 200 status when healthy, 503 when unhealthy
    - Format responses according to design specification
    - _Requirements: 4.1, 4.2, 4.3, 4.5_
  
  - [ ]* 5.2 Write unit tests for health controller
    - Test `/health/db` returns 200 when connected
    - Test `/health/db` returns 503 when disconnected
    - Test response includes all required fields
    - Test credentials are not exposed in responses

- [ ] 6. Implement database middleware (Presentation Layer)
  - [ ] 6.1 Create database middleware for route protection
    - Create `src/middleware/database.middleware.ts`
    - Implement `requireDatabase` middleware that checks connection status
    - Return 503 Service Unavailable when database is disconnected
    - Implement `attachDatabaseStatus` middleware to add status to request context
    - _Requirements: 3.4_
  
  - [ ]* 6.2 Write property test for database-dependent endpoint protection
    - **Property 5: Database-Dependent Endpoint Protection**
    - **Validates: Requirements 3.4**

- [ ] 7. Update application startup and shutdown (Integration)
  - [ ] 7.1 Refactor application startup in src/index.ts
    - Import and initialize ConnectionManager
    - Call `initializeConnection()` with retry logic
    - Continue starting HTTP server regardless of database status
    - Log appropriate messages for connected/degraded states
    - Register health check routes with HealthController
    - Set up dependency injection for services and controllers
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [ ] 7.2 Implement background reconnection timer
    - Create background timer that runs every 30 seconds
    - Check if database is disconnected
    - Attempt reconnection with reduced retry count
    - Clear timer when connection is restored
    - _Requirements: 3.5_
  
  - [ ]* 7.3 Write property test for background reconnection
    - **Property 6: Background Reconnection Attempts**
    - **Validates: Requirements 3.5**
  
  - [ ] 7.4 Update graceful shutdown handlers
    - Call ConnectionManager `disconnect()` method on SIGTERM/SIGINT
    - Wait for graceful disconnect with timeout
    - Log shutdown progress and completion
    - _Requirements: 5.3, 5.4, 5.5_
  
  - [ ]* 7.5 Write property test for graceful degradation
    - **Property 4: Graceful Degradation on Connection Failure**
    - **Validates: Requirements 3.1**

- [ ] 8. Implement comprehensive error logging
  - [ ] 8.1 Add structured error logging throughout connection manager
    - Log all connection attempts with context
    - Log retry attempts with remaining retries
    - Log final errors with troubleshooting guidance
    - Include sanitized URLs in all logs
    - Include error categorization in logs
    - Format logs as structured JSON with timestamps
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [ ]* 8.2 Write property test for error logging with context
    - **Property 11: Error Logging with Context and Categorization**
    - **Validates: Requirements 6.1, 6.5**
  
  - [ ]* 8.3 Write unit tests for specific error types
    - Test network timeout error includes troubleshooting steps
    - Test authentication error doesn't expose passwords
    - Test database not found error suggests checking database name

- [ ] 9. Checkpoint - Integration testing
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Update documentation
  - [ ] 10.1 Update README with database setup instructions
    - Document how to start Docker PostgreSQL: `docker-compose up -d postgres`
    - Document connection retry behavior and startup sequence
    - Add troubleshooting section for common connection issues
    - Document health check endpoints and their responses
    - _Requirements: 7.4, 7.5_
  
  - [ ] 10.2 Add inline code documentation
    - Add JSDoc comments to all public methods in ConnectionManager
    - Add JSDoc comments to HealthService methods
    - Add JSDoc comments to HealthController methods
    - Document middleware usage patterns

- [ ] 11. Final checkpoint - End-to-end verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP
- Each task references specific requirements for traceability
- The implementation follows strict 3-tier architecture: Data Access → Business Logic → Presentation
- Connection manager is in the data access layer (src/config/database.ts)
- Health service is in the business logic layer (src/services/health.service.ts)
- Health controller and middleware are in the presentation layer
- Property-based tests use the `fast-check` library with minimum 100 iterations
- Unit tests focus on specific examples, edge cases, and error conditions
- Checkpoints ensure incremental validation and allow for user feedback

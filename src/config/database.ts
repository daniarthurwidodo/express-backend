import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { 
  ValidationResult, 
  DatabaseError, 
  ConnectionResult, 
  ConnectionStatus,
  ConnectionState,
  IConnectionManager,
  DrizzleClient
} from '../models/database.types';

/**
 * Sleep utility function for implementing delays
 * 
 * @param ms - Number of milliseconds to sleep
 * @returns Promise that resolves after the specified delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validates the format of a database URL
 * Detects common misconfigurations and provides helpful error messages
 * 
 * @param url - The database URL to validate
 * @returns ValidationResult indicating if the URL is valid and any error message
 */
export function validateDatabaseUrl(url: string): ValidationResult {
  // Check if URL is empty or undefined
  if (!url || url.trim() === '') {
    return { 
      valid: false, 
      error: 'DATABASE_URL is not set. Expected format: postgresql://user:password@host:port/database' 
    };
  }

  // Check for Prisma Postgres URL (legacy misconfiguration from Prisma migration)
  if (url.startsWith('prisma+postgres://')) {
    return { 
      valid: false, 
      error: 'Prisma Postgres URL detected. This format is not supported with Drizzle ORM. Use standard PostgreSQL format: postgresql://user:password@host:port/database'
    };
  }

  // Check for other common protocol mistakes
  if (url.startsWith('postgres://')) {
    // postgres:// is valid but postgresql:// is preferred
    // We'll allow it but could warn
    return { valid: true };
  }

  if (!url.startsWith('postgresql://')) {
    return {
      valid: false,
      error: `Invalid protocol. Expected 'postgresql://' but got '${url.split('://')[0]}://'. Use format: postgresql://user:password@host:port/database`
    };
  }

  // Validate PostgreSQL URL format: postgresql://user:password@host:port/database
  // This regex checks for the basic structure
  const postgresUrlPattern = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)$/;
  const match = url.match(postgresUrlPattern);

  if (!match) {
    // Try to provide more specific error messages
    if (!url.includes('@')) {
      return {
        valid: false,
        error: 'Invalid URL format: missing credentials. Expected format: postgresql://user:password@host:port/database'
      };
    }
    if (!url.includes(':')) {
      return {
        valid: false,
        error: 'Invalid URL format: missing port or password. Expected format: postgresql://user:password@host:port/database'
      };
    }
    if (url.split('/').length < 4) {
      return {
        valid: false,
        error: 'Invalid URL format: missing database name. Expected format: postgresql://user:password@host:port/database'
      };
    }
    
    return {
      valid: false,
      error: 'Invalid PostgreSQL URL format. Expected: postgresql://user:password@host:port/database'
    };
  }

  // Extract components for additional validation
  const [, user, password, host, port, database] = match;

  // Validate components are not empty
  if (!user || !password || !host || !port || !database) {
    return {
      valid: false,
      error: 'Invalid URL format: all components (user, password, host, port, database) must be provided'
    };
  }

  // Validate port is a valid number
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return {
      valid: false,
      error: `Invalid port number: ${port}. Port must be between 1 and 65535`
    };
  }

  return { valid: true };
}

/**
 * Sanitizes a database URL by removing credentials
 * Used for safe logging without exposing passwords
 * 
 * @param url - The database URL to sanitize
 * @returns Sanitized URL with credentials replaced by asterisks
 */
export function sanitizeUrl(url: string): string {
  if (!url) {
    return '';
  }

  // Replace credentials in format: protocol://user:password@host
  // with: protocol://***:***@host
  const sanitized = url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
  
  return sanitized;
}

/**
 * Categorizes database errors as temporary (retryable) or permanent (non-retryable)
 * Provides troubleshooting guidance for common error types
 * 
 * @param error - The error to categorize
 * @returns DatabaseError with category and troubleshooting steps
 */
export function categorizeError(error: Error): DatabaseError {
  const message = error.message;
  const errorString = error.toString();

  // Network and connection errors (temporary - retryable)
  if (
    message.includes('ETIMEDOUT') || 
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('EHOSTUNREACH') ||
    message.includes('ENETUNREACH') ||
    message.includes('Connection terminated unexpectedly') ||
    message.includes('Connection timeout')
  ) {
    return new DatabaseError(
      message,
      'NETWORK_ERROR',
      'temporary',
      [
        'Check if PostgreSQL container is running: docker ps',
        'Verify network connectivity to database host',
        'Check firewall rules for the database port',
        'Ensure DATABASE_URL host and port are correct'
      ]
    );
  }

  // Connection pool exhausted (temporary - retryable)
  if (
    message.includes('Connection pool timeout') ||
    message.includes('Too many connections') ||
    message.includes('remaining connection slots')
  ) {
    return new DatabaseError(
      message,
      'POOL_EXHAUSTED',
      'temporary',
      [
        'Increase connection pool size in DATABASE_URL',
        'Check for connection leaks in application code',
        'Reduce concurrent database operations',
        'Consider implementing connection pooling at application level'
      ]
    );
  }

  // DNS resolution failures (temporary - retryable)
  if (message.includes('getaddrinfo') || message.includes('ENOTFOUND')) {
    return new DatabaseError(
      message,
      'DNS_ERROR',
      'temporary',
      [
        'Check if database host name is correct',
        'Verify DNS resolution is working',
        'Try using IP address instead of hostname',
        'Check /etc/hosts file for correct entries'
      ]
    );
  }

  // Authentication failures (permanent - non-retryable)
  if (
    message.includes('28P01') || // Invalid password
    message.includes('authentication failed') ||
    message.includes('password authentication failed') ||
    message.includes('no password supplied')
  ) {
    return new DatabaseError(
      'Authentication failed. Please check database credentials.',
      'AUTH_FAILED',
      'permanent',
      [
        'Verify username and password in DATABASE_URL',
        'Check if database user exists',
        'Ensure user has correct permissions',
        'Note: Credentials are not logged for security'
      ]
    );
  }

  // Database does not exist (permanent - non-retryable)
  if (
    message.includes('3D000') || // Database does not exist
    message.includes('database') && message.includes('does not exist')
  ) {
    return new DatabaseError(
      message,
      'DATABASE_NOT_FOUND',
      'permanent',
      [
        'Check if database name in DATABASE_URL is correct',
        'Create the database if it doesn\'t exist',
        'Verify you have access to the specified database',
        'Run database migrations if needed'
      ]
    );
  }

  // SSL/TLS errors (permanent - non-retryable)
  if (
    message.includes('SSL') ||
    message.includes('TLS') ||
    message.includes('certificate') ||
    message.includes('DEPTH_ZERO_SELF_SIGNED_CERT')
  ) {
    return new DatabaseError(
      message,
      'SSL_ERROR',
      'permanent',
      [
        'Check SSL/TLS configuration in DATABASE_URL',
        'Add ?sslmode=disable for local development (not recommended for production)',
        'Verify SSL certificates are valid',
        'Check if database requires SSL connection'
      ]
    );
  }

  // Drizzle-specific errors
  if (message.includes('drizzle') || errorString.includes('drizzle')) {
    // Check for schema/migration issues
    if (
      message.includes('schema') ||
      message.includes('migration') ||
      message.includes('generate')
    ) {
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
  }

  // Default: treat unknown errors as temporary to allow retry
  return new DatabaseError(
    message,
    'UNKNOWN_ERROR',
    'temporary',
    [
      'Check database logs for more details',
      'Verify DATABASE_URL is correct',
      'Ensure database is running and accessible',
      'Check application logs for additional context'
    ]
  );
}


/**
 * ConnectionManager class - Manages database connection lifecycle
 * 
 * This singleton class handles:
 * - Database Pool and Drizzle client instance management
 * - Connection initialization with retry logic
 * - Connection state tracking
 * - Graceful disconnection with timeout
 * - Background reconnection attempts
 * 
 * The ConnectionManager uses node-postgres (pg) Pool for connection pooling
 * and wraps it with Drizzle ORM for type-safe database operations.
 * 
 * @example
 * // Initialize connection
 * const manager = ConnectionManager.getInstance();
 * await manager.initializeConnection();
 * 
 * // Get Drizzle client for queries
 * const db = manager.getDbClient();
 * if (db) {
 *   // Use Drizzle query builder
 *   // const results = await db.select().from(users);
 * }
 * 
 * // Check connection status
 * const status = manager.getConnectionStatus();
 * console.log('Connected:', status.connected);
 * 
 * // Graceful shutdown
 * await manager.disconnect();
 */
export class ConnectionManager implements IConnectionManager {
  private static instance: ConnectionManager;
  private state: ConnectionState;
  private readonly DISCONNECT_TIMEOUT = 5000; // 5 seconds
  private readonly RECONNECT_INTERVAL = 30000; // 30 seconds

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {
    this.state = {
      pool: null,
      dbClient: null,
      connected: false,
      lastConnectedAt: null,
      lastError: null,
      retryCount: 0,
      reconnectTimer: null
    };
  }

  /**
   * Get the singleton instance of ConnectionManager
   * 
   * @returns The singleton ConnectionManager instance
   */
  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Initialize database connection with retry logic
   * 
   * This method:
   * - Validates the DATABASE_URL environment variable
   * - Creates a node-postgres Pool instance with configuration
   * - Wraps the Pool with Drizzle ORM for type-safe queries
   * - Tests connection by executing 'SELECT 1' query
   * - Implements exponential backoff retry on failures
   * - Updates internal connection state
   * - Starts background reconnection timer if initial connection fails
   * 
   * Configuration via environment variables:
   * - DATABASE_URL: PostgreSQL connection string (required)
   * - DB_POOL_SIZE: Maximum pool size (default: 10)
   * - DB_CONNECTION_TIMEOUT: Connection timeout in ms (default: 10000)
   * - DB_MAX_RETRIES: Maximum retry attempts (default: 5)
   * - DB_RETRY_BASE_DELAY: Base delay for exponential backoff in ms (default: 1000)
   * 
   * @returns ConnectionResult indicating success or failure with details
   * 
   * @example
   * const result = await manager.initializeConnection();
   * if (result.success) {
   *   console.log('Connected successfully');
   * } else {
   *   console.error('Connection failed:', result.message);
   * }
   */
  public async initializeConnection(): Promise<ConnectionResult> {
    const databaseUrl = process.env.DATABASE_URL || '';
    
    // Validate DATABASE_URL
    const validation = validateDatabaseUrl(databaseUrl);
    if (!validation.valid) {
      const error = new Error(validation.error || 'Invalid DATABASE_URL');
      this.state.lastError = error;
      
      console.log(JSON.stringify({
        level: 'error',
        time: new Date().toISOString(),
        msg: 'Database URL validation failed',
        context: 'initialization',
        error: validation.error
      }));

      return {
        success: false,
        message: validation.error || 'Invalid DATABASE_URL',
        error
      };
    }

    // Create Pool instance if not already created
    if (!this.state.pool) {
      const poolConfig = {
        connectionString: databaseUrl,
        max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
      };
      
      this.state.pool = new Pool(poolConfig);
      
      // Wrap Pool with Drizzle
      this.state.dbClient = drizzle(this.state.pool);
    }

    // Get retry configuration from environment or use defaults
    const maxRetries = parseInt(process.env.DB_MAX_RETRIES || '5', 10);
    const baseDelay = parseInt(process.env.DB_RETRY_BASE_DELAY || '1000', 10);

    // Attempt connection with retry logic
    const result = await this.connectWithRetryInternal(maxRetries, baseDelay);

    if (result.success) {
      this.state.connected = true;
      this.state.lastConnectedAt = new Date();
      this.state.lastError = null;
      this.state.retryCount = result.attemptCount || 0;
      
      // Clear any existing reconnection timer
      if (this.state.reconnectTimer) {
        clearInterval(this.state.reconnectTimer);
        this.state.reconnectTimer = null;
      }
    } else {
      this.state.connected = false;
      this.state.lastError = result.error || null;
      this.state.retryCount = result.attemptCount || 0;
      
      // Start background reconnection timer
      this.startReconnectionTimer();
    }

    return result;
  }

  /**
   * Get the Drizzle client instance
   * 
   * Returns the Drizzle-wrapped database client for executing type-safe queries.
   * The client provides access to Drizzle's query builder API.
   * 
   * @returns DrizzleClient instance or null if not initialized
   * 
   * @example
   * const db = manager.getDbClient();
   * if (db) {
   *   // Use Drizzle query builder
   *   // const users = await db.select().from(usersTable);
   *   // const result = await db.insert(usersTable).values({ name: 'John' });
   * }
   */
  public getDbClient(): DrizzleClient | null {
    return this.state.dbClient;
  }

  /**
   * Get the Prisma Client instance
   * 
   * @deprecated This method is deprecated after migration from Prisma to Drizzle.
   *             Use getDbClient() instead. This method now returns the Drizzle client
   *             for backward compatibility with existing code.
   * 
   * @returns DrizzleClient instance or null if not initialized
   * 
   * @example
   * // Old Prisma usage (deprecated):
   * // const prisma = manager.getPrismaClient();
   * 
   * // New Drizzle usage (recommended):
   * const db = manager.getDbClient();
   */
  public getPrismaClient(): DrizzleClient | null {
    return this.state.dbClient;
  }

  /**
   * Check if database is currently connected
   * 
   * @returns true if connected, false otherwise
   */
  public isConnected(): boolean {
    return this.state.connected;
  }

  /**
   * Get detailed connection status
   * 
   * @returns ConnectionStatus with current state information
   */
  public getConnectionStatus(): ConnectionStatus {
    const databaseUrl = process.env.DATABASE_URL || '';
    
    return {
      connected: this.state.connected,
      lastConnectedAt: this.state.lastConnectedAt || undefined,
      lastError: this.state.lastError?.message,
      retryCount: this.state.retryCount,
      databaseUrl: sanitizeUrl(databaseUrl)
    };
  }

  /**
   * Disconnect from database gracefully
   * 
   * This method:
   * - Clears the background reconnection timer if running
   * - Waits for pending queries to complete (with timeout)
   * - Closes the node-postgres connection pool
   * - Updates connection state to disconnected
   * - Handles timeout scenarios gracefully
   * 
   * The disconnect operation has a 5-second timeout. If the pool doesn't
   * close within this time, the connection is forcefully closed.
   * 
   * @returns Promise that resolves when disconnection is complete
   * 
   * @example
   * // Graceful shutdown
   * await manager.disconnect();
   * console.log('Database disconnected');
   */
  public async disconnect(): Promise<void> {
    // Clear reconnection timer if running
    if (this.state.reconnectTimer) {
      clearInterval(this.state.reconnectTimer);
      this.state.reconnectTimer = null;
    }

    if (!this.state.pool) {
      console.log(JSON.stringify({
        level: 'info',
        time: new Date().toISOString(),
        msg: 'No database connection to disconnect',
        context: 'shutdown'
      }));
      return;
    }

    console.log(JSON.stringify({
      level: 'info',
      time: new Date().toISOString(),
      msg: 'Initiating graceful database disconnect',
      context: 'shutdown',
      timeout: this.DISCONNECT_TIMEOUT
    }));

    try {
      // Create a timeout promise
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Disconnect timeout exceeded'));
        }, this.DISCONNECT_TIMEOUT);
      });

      // Race between disconnect and timeout
      await Promise.race([
        this.state.pool.end(),
        timeoutPromise
      ]);

      console.log(JSON.stringify({
        level: 'info',
        time: new Date().toISOString(),
        msg: 'Database disconnected successfully',
        context: 'shutdown'
      }));

    } catch (error) {
      if (error instanceof Error && error.message === 'Disconnect timeout exceeded') {
        console.log(JSON.stringify({
          level: 'warn',
          time: new Date().toISOString(),
          msg: 'Disconnect timeout reached, forcing connection close',
          context: 'shutdown',
          timeout: this.DISCONNECT_TIMEOUT
        }));
      } else {
        console.log(JSON.stringify({
          level: 'error',
          time: new Date().toISOString(),
          msg: 'Error during database disconnect',
          context: 'shutdown',
          error: error instanceof Error ? error.message : 'Unknown error'
        }));
      }
    } finally {
      // Update state regardless of success/failure
      this.state.connected = false;
      this.state.pool = null;
      this.state.dbClient = null;
    }
  }

  /**
   * Attempt to reconnect to the database
   * 
   * This method is used for background reconnection attempts when the
   * database connection is lost. It recreates the Pool and Drizzle client
   * if needed and attempts to establish a new connection.
   * 
   * Uses fewer retries (3) than initial connection (5) to avoid excessive
   * retry attempts during background reconnection.
   * 
   * @returns ConnectionResult indicating success or failure
   * 
   * @example
   * // Manual reconnection attempt
   * const result = await manager.reconnect();
   * if (result.success) {
   *   console.log('Reconnected successfully');
   * }
   */
  public async reconnect(): Promise<ConnectionResult> {
    console.log(JSON.stringify({
      level: 'info',
      time: new Date().toISOString(),
      msg: 'Attempting database reconnection',
      context: 'reconnection'
    }));

    // If already connected, no need to reconnect
    if (this.state.connected && this.state.pool) {
      return {
        success: true,
        message: 'Already connected'
      };
    }

    // Recreate pool if needed
    if (!this.state.pool) {
      const databaseUrl = process.env.DATABASE_URL || '';
      const poolConfig = {
        connectionString: databaseUrl,
        max: parseInt(process.env.DB_POOL_SIZE || '10', 10),
        idleTimeoutMillis: 10000,
        connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
      };
      
      this.state.pool = new Pool(poolConfig);
      
      // Wrap Pool with Drizzle
      this.state.dbClient = drizzle(this.state.pool);
    }

    // Use fewer retries for background reconnection (3 instead of 5)
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds base delay

    const result = await this.connectWithRetryInternal(maxRetries, baseDelay);

    if (result.success) {
      this.state.connected = true;
      this.state.lastConnectedAt = new Date();
      this.state.lastError = null;
      this.state.retryCount = result.attemptCount || 0;
      
      // Clear reconnection timer on successful reconnection
      if (this.state.reconnectTimer) {
        clearInterval(this.state.reconnectTimer);
        this.state.reconnectTimer = null;
      }

      console.log(JSON.stringify({
        level: 'info',
        time: new Date().toISOString(),
        msg: 'Database reconnection successful',
        context: 'reconnection'
      }));
    } else {
      this.state.connected = false;
      this.state.lastError = result.error || null;
      this.state.retryCount = result.attemptCount || 0;
    }

    return result;
  }

  /**
   * Internal method to connect with retry logic
   * 
   * Implements exponential backoff retry strategy for database connections.
   * Tests connection by executing 'SELECT 1' query through the Pool.
   * 
   * Retry delay calculation: baseDelay * 2^(attempt-1)
   * Example with baseDelay=1000ms:
   * - Attempt 1: immediate
   * - Attempt 2: 1000ms delay
   * - Attempt 3: 2000ms delay
   * - Attempt 4: 4000ms delay
   * - Attempt 5: 8000ms delay
   * 
   * @param maxRetries - Maximum number of retry attempts
   * @param baseDelay - Base delay in milliseconds for exponential backoff
   * @returns ConnectionResult with attempt details
   */
  private async connectWithRetryInternal(
    maxRetries: number,
    baseDelay: number
  ): Promise<ConnectionResult> {
    if (!this.state.pool) {
      return {
        success: false,
        message: 'Database pool not initialized',
        error: new Error('Database pool not initialized')
      };
    }

    const databaseUrl = process.env.DATABASE_URL || '';
    const sanitizedUrl = sanitizeUrl(databaseUrl);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(JSON.stringify({
          level: 'info',
          time: new Date().toISOString(),
          msg: 'Attempting database connection',
          context: 'connection-retry',
          attempt,
          maxRetries,
          remainingRetries: maxRetries - attempt,
          databaseUrl: sanitizedUrl
        }));

        // Test connection by executing a simple query
        await this.state.pool.query('SELECT 1');

        // Connection successful
        console.log(JSON.stringify({
          level: 'info',
          time: new Date().toISOString(),
          msg: 'Database connection successful',
          context: 'connection-retry',
          attempt,
          databaseUrl: sanitizedUrl
        }));

        return {
          success: true,
          message: `Connected successfully on attempt ${attempt}`,
          attemptCount: attempt
        };

      } catch (error) {
        const dbError = categorizeError(error as Error);
        
        console.log(JSON.stringify({
          level: 'error',
          time: new Date().toISOString(),
          msg: 'Database connection failed',
          context: 'connection-retry',
          attempt,
          maxRetries,
          remainingRetries: maxRetries - attempt,
          databaseUrl: sanitizedUrl,
          error: {
            code: dbError.code,
            message: dbError.message,
            category: dbError.category
          },
          troubleshooting: dbError.troubleshooting
        }));

        // If this was the last attempt, return failure
        if (attempt === maxRetries) {
          console.log(JSON.stringify({
            level: 'error',
            time: new Date().toISOString(),
            msg: 'All connection retry attempts exhausted',
            context: 'connection-retry',
            totalAttempts: attempt,
            databaseUrl: sanitizedUrl,
            error: {
              code: dbError.code,
              message: dbError.message,
              category: dbError.category
            },
            troubleshooting: dbError.troubleshooting
          }));

          return {
            success: false,
            message: `Failed to connect after ${attempt} attempts`,
            attemptCount: attempt,
            error: error as Error
          };
        }

        // Calculate exponential backoff delay: baseDelay * 2^(attempt-1)
        const delay = baseDelay * Math.pow(2, attempt - 1);

        console.log(JSON.stringify({
          level: 'info',
          time: new Date().toISOString(),
          msg: 'Waiting before retry',
          context: 'connection-retry',
          attempt,
          nextAttempt: attempt + 1,
          delayMs: delay,
          databaseUrl: sanitizedUrl
        }));

        // Wait before next retry
        await sleep(delay);
      }
    }

    // This should never be reached, but TypeScript requires a return
    return {
      success: false,
      message: 'Unexpected error in retry logic',
      attemptCount: maxRetries
    };
  }

  /**
   * Start background reconnection timer
   * 
   * This timer periodically attempts to reconnect when the database is unavailable.
   * It runs every 30 seconds (RECONNECT_INTERVAL) and automatically stops when
   * connection is successfully restored.
   * 
   * The timer is started automatically when:
   * - Initial connection fails during initializeConnection()
   * - Connection is lost and needs recovery
   * 
   * The timer is stopped when:
   * - Connection is successfully established
   * - disconnect() is called
   */
  private startReconnectionTimer(): void {
    // Don't start if already running
    if (this.state.reconnectTimer) {
      return;
    }

    console.log(JSON.stringify({
      level: 'info',
      time: new Date().toISOString(),
      msg: 'Starting background reconnection timer',
      context: 'reconnection',
      interval: this.RECONNECT_INTERVAL
    }));

    this.state.reconnectTimer = setInterval(async () => {
      // If already connected, stop the timer
      if (this.state.connected) {
        if (this.state.reconnectTimer) {
          clearInterval(this.state.reconnectTimer);
          this.state.reconnectTimer = null;
        }
        return;
      }

      // Attempt reconnection
      await this.reconnect();
    }, this.RECONNECT_INTERVAL);
  }
}

// Export singleton instance getter for convenience
export const getConnectionManager = (): ConnectionManager => {
  return ConnectionManager.getInstance();
};

// Legacy exports for backward compatibility
// These delegate to the ConnectionManager singleton

/**
 * Get the database client instance
 * 
 * @deprecated This function is deprecated after migration from Prisma to Drizzle.
 *             Use getDbClient() or getConnectionManager().getDbClient() instead.
 *             This function now returns the Drizzle client for backward compatibility.
 * 
 * @returns DrizzleClient instance or null if not initialized
 * 
 * @example
 * // Deprecated usage:
 * // const prisma = getPrismaClient();
 * 
 * // Recommended usage:
 * const db = getDbClient();
 * // or
 * const db = getConnectionManager().getDbClient();
 */
export const getPrismaClient = (): DrizzleClient | null => {
  return getConnectionManager().getDbClient();
};

/**
 * Get the database client instance
 * 
 * Returns the Drizzle-wrapped database client for executing type-safe queries.
 * This is a convenience function that delegates to the ConnectionManager singleton.
 * 
 * @returns DrizzleClient instance or null if not initialized
 * 
 * @example
 * const db = getDbClient();
 * if (db) {
 *   // Use Drizzle query builder
 *   // const users = await db.select().from(usersTable);
 *   // const result = await db.insert(usersTable).values({ name: 'John' });
 * }
 */
export const getDbClient = (): DrizzleClient | null => {
  return getConnectionManager().getDbClient();
};

/**
 * Disconnect from the database
 * 
 * Gracefully closes the database connection pool and cleans up resources.
 * This is a convenience function that delegates to the ConnectionManager singleton.
 * 
 * @returns Promise that resolves when disconnection is complete
 * 
 * @example
 * // During application shutdown
 * await disconnectDatabase();
 * console.log('Database disconnected');
 */
export const disconnectDatabase = async (): Promise<void> => {
  return getConnectionManager().disconnect();
};

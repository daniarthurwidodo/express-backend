import { Pool } from 'pg';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

/**
 * Drizzle client type for database operations
 * 
 * This type represents a Drizzle ORM client configured for PostgreSQL using node-postgres.
 * It provides type-safe query building and execution based on the schema definition.
 * 
 * @see {@link https://orm.drizzle.team/docs/overview|Drizzle ORM Documentation}
 */
export type DrizzleClient = NodePgDatabase<typeof schema>;

/**
 * Result of a connection attempt
 */
export interface ConnectionResult {
  success: boolean;
  message: string;
  attemptCount?: number;
  error?: Error;
}

/**
 * Current status of the database connection
 */
export interface ConnectionStatus {
  connected: boolean;
  lastConnectedAt?: Date;
  lastError?: string;
  retryCount: number;
  databaseUrl: string; // Sanitized (no credentials)
}

/**
 * Internal state maintained by the connection manager
 * 
 * Tracks the PostgreSQL connection pool, Drizzle client wrapper, connection status,
 * and retry/reconnection state for robust connection management.
 */
export interface ConnectionState {
  /** PostgreSQL connection pool from node-postgres */
  pool: Pool | null;
  /** Drizzle ORM client wrapping the connection pool */
  dbClient: DrizzleClient | null;
  /** Whether the database is currently connected */
  connected: boolean;
  /** Timestamp of last successful connection */
  lastConnectedAt: Date | null;
  /** Last error encountered during connection attempts */
  lastError: Error | null;
  /** Number of retry attempts made */
  retryCount: number;
  /** Timer for automatic reconnection attempts */
  reconnectTimer: NodeJS.Timeout | null;
}

/**
 * Database configuration from environment variables
 */
export interface DatabaseConfig {
  DATABASE_URL: string;
  DB_CONNECTION_TIMEOUT?: number; // Default: 10000ms
  DB_MAX_RETRIES?: number;        // Default: 5
  DB_RETRY_BASE_DELAY?: number;   // Default: 1000ms
  DB_POOL_SIZE?: number;          // Default: 10
}

/**
 * Result of URL validation
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Database health check result
 */
export interface DatabaseHealthResult {
  connected: boolean;
  responseTime?: number;
  error?: string;
  lastConnectedAt?: Date;
}

/**
 * Overall system health result
 */
export interface SystemHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: DatabaseHealthResult;
  timestamp: Date;
}

/**
 * Connection manager interface
 * 
 * Defines the contract for managing database connections using Drizzle ORM.
 * Implements singleton pattern with retry logic, automatic reconnection,
 * and graceful shutdown capabilities.
 */
export interface IConnectionManager {
  /**
   * Initialize database connection with exponential backoff retry logic
   * 
   * Creates a PostgreSQL connection pool and wraps it with Drizzle ORM client.
   * Validates connection by executing a test query.
   * 
   * @returns Promise resolving to connection result with success status and details
   */
  initializeConnection(): Promise<ConnectionResult>;
  
  /**
   * Get the Drizzle client instance for database operations
   * 
   * @returns Drizzle client if connected, null otherwise
   */
  getDbClient(): DrizzleClient | null;
  
  /**
   * Check if database is currently connected
   * 
   * @returns true if connected, false otherwise
   */
  isConnected(): boolean;
  
  /**
   * Get detailed connection status information
   * 
   * @returns Current connection status including timestamps and error details
   */
  getConnectionStatus(): ConnectionStatus;
  
  /**
   * Disconnect from database gracefully with timeout
   * 
   * Closes the connection pool and cleans up resources.
   * Implements a 5-second timeout for graceful shutdown.
   */
  disconnect(): Promise<void>;
  
  /**
   * Attempt to reconnect to the database
   * 
   * Recreates the connection pool and Drizzle client, then validates connectivity.
   * Uses reduced retry attempts compared to initial connection.
   * 
   * @returns Promise resolving to reconnection result
   */
  reconnect(): Promise<ConnectionResult>;
}

/**
 * Custom database error class with error categorization
 */
export class DatabaseError extends Error {
  public readonly code: string;
  public readonly category: 'temporary' | 'permanent';
  public readonly troubleshooting?: string[];

  constructor(
    message: string,
    code: string,
    category: 'temporary' | 'permanent',
    troubleshooting?: string[]
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.category = category;
    this.troubleshooting = troubleshooting;
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DatabaseError);
    }
  }
}

import { DrizzleClient } from '../models/database.types';
import { getDbClient } from '../config/database';

/**
 * Base repository class providing database client access
 * 
 * This abstract class provides a Drizzle ORM client instance to all repository implementations,
 * following the Data Access Layer pattern in the 3-tier architecture. All repositories should
 * extend this class to access the database through a consistent interface.
 * 
 * The Drizzle client is obtained from the ConnectionManager singleton and provides type-safe
 * query building capabilities based on the schema definition.
 * 
 * @example
 * ```typescript
 * import { eq } from 'drizzle-orm';
 * import { users } from '../db/schema';
 * 
 * export class UserRepository extends BaseRepository {
 *   async findById(id: string) {
 *     return this.db.query.users.findFirst({ 
 *       where: eq(users.id, id) 
 *     });
 *   }
 * 
 *   async create(data: NewUser) {
 *     const [user] = await this.db.insert(users).values(data).returning();
 *     return user;
 *   }
 * }
 * ```
 * 
 * @see {@link https://orm.drizzle.team/docs/overview|Drizzle ORM Documentation}
 */
export abstract class BaseRepository {
  /**
   * Drizzle database client instance
   * 
   * Use this property to execute database queries using Drizzle's query builder API.
   * The client provides type-safe access to all tables defined in the schema.
   * 
   * @example
   * ```typescript
   * // Query builder syntax
   * const users = await this.db.query.users.findMany();
   * 
   * // SQL-like syntax
   * const users = await this.db.select().from(usersTable);
   * ```
   */
  protected readonly db: DrizzleClient;

  /**
   * Constructor initializes the database client from ConnectionManager
   * 
   * Retrieves the Drizzle client instance from the ConnectionManager singleton.
   * Throws an error if the database connection has not been initialized.
   * 
   * @throws {Error} If database client is not initialized. Ensure 
   *                 ConnectionManager.initializeConnection() is called during
   *                 application startup before creating repository instances.
   */
  constructor() {
    const client = getDbClient();
    
    if (!client) {
      throw new Error(
        'Database client not initialized. Ensure ConnectionManager.initializeConnection() is called before creating repository instances.'
      );
    }
    
    this.db = client;
  }
}

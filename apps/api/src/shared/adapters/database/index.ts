/**
 * Public API of the database adapter. Feature modules import from here, never
 * from the private implementation files.
 */
export { DatabaseModule } from './database.module';
export { DATABASE_CONNECTION } from './database.tokens';
export type { Database } from './database.types';

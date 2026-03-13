import { supabase } from '../lib/supabase.js';
import { logger } from '../utils/logger.js';

const KEEP_ALIVE_TABLES = ['products', 'orders', 'transactions'] as const;

export class KeepAliveService {
  async pingDatabase() {
    const checkedAt = new Date().toISOString();
    const errors: string[] = [];

    for (const table of KEEP_ALIVE_TABLES) {
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(1);

      if (!error) {
        logger.info('Supabase keep-alive ping succeeded', { table, checkedAt });
        return { ok: true, table, checkedAt };
      }

      errors.push(`${table}: ${error.message}`);
    }

    const message = `Supabase keep-alive failed for all probe tables: ${errors.join('; ')}`;
    logger.error(message);
    throw new Error(message);
  }
}

export const keepAliveService = new KeepAliveService();

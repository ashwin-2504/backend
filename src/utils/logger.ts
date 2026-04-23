const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  info: (message: string, meta?: object) => {
    if (isDev) {
      console.log(`[INFO] ${message}`, meta ? meta : '');
    } else {
      console.log(JSON.stringify({
        level: 'info',
        message,
        timestamp: new Date().toISOString(),
        ...meta
      }));
    }
  },
  error: (message: string, error?: any, meta?: object) => {
    if (isDev) {
      console.error(`[ERROR] ${message}`, error || '', meta ? meta : '');
    } else {
      console.error(JSON.stringify({
        level: 'error',
        message,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        ...meta
      }));
    }
  },
  warn: (message: string, error?: any, meta?: object) => {
    if (isDev) {
      console.warn(`[WARN] ${message}`, error || '', meta ? meta : '');
    } else {
      console.warn(JSON.stringify({
        level: 'warn',
        message,
        error: error instanceof Error ? error.message : error,
        timestamp: new Date().toISOString(),
        ...meta
      }));
    }
  }
};

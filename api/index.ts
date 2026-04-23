import 'dotenv/config';
import { validateEnv } from '../src/utils/config.js';
import app from '../src/app.js';

// Fail fast on missing env vars — surfaces errors in Vercel function logs
validateEnv();

export default app;

// Loads .env before any other module reads process.env. Import this first.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch {
  // No .env file: every setting is optional.
}

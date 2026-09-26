import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = join(ROOT, 'src');
export const DIST = join(ROOT, 'dist');
export const STORE = join(ROOT, 'store');

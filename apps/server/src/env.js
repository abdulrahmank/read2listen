import path from 'path';

/**
 * Env access convention: read at point of use, no fallback for anything
 * secret or required — missing required values fail loud. Only cosmetic
 * settings get defaults.
 */
export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required (see .env.example)`);
  }
  return value;
}

export function dataDir() {
  const value = process.env.DATA_DIR || './data';
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

export function maxUploadBytes() {
  const mb = parseInt(process.env.MAX_UPLOAD_MB, 10) || 25;
  return mb * 1024 * 1024;
}

import crypto from 'crypto';
import { asyncHandler } from './errorHandler.js';

export const hashKey = (key) =>
  crypto.createHash('sha256').update(String(key)).digest('hex');

/**
 * X-API-Key → tenant + role. Keys are stored hashed; a key maps to exactly
 * one tenant, which is what scopes every downstream query and path.
 */
export function createAuth(tenantRepo) {
  const authenticate = asyncHandler(async (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({ success: false, error: 'Missing API key' });
    }

    const match = await tenantRepo.findByKeyHash(hashKey(apiKey));
    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    req.tenant = match.tenant;
    req.role = match.role;
    next();
  });

  const requireAdmin = (req, res, next) => {
    if (req.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin key required' });
    }
    next();
  };

  return { authenticate, requireAdmin };
}

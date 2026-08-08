import crypto from 'crypto';
import logger from '../logger.js';
import { hashKey } from '../auth.js';
import { ensureTenantRoot } from '../tenantDir.js';

/**
 * Zero-config self-hosting: first boot against an empty tenants collection
 * creates a "default" tenant. Keys come from DEFAULT_ADMIN_KEY /
 * DEFAULT_MEMBER_KEY env, or are generated and printed to the log ONCE —
 * only hashes are stored, so they cannot be recovered later.
 */
export async function ensureDefaultTenant(tenantRepo) {
  if ((await tenantRepo.count()) > 0) {
    return null;
  }

  const adminKey = process.env.DEFAULT_ADMIN_KEY || generateKey('admin');
  const memberKey = process.env.DEFAULT_MEMBER_KEY || generateKey('member');

  const tenant = await tenantRepo.create({
    name: 'default',
    keys: [
      { hash: hashKey(adminKey), role: 'admin' },
      { hash: hashKey(memberKey), role: 'member' }
    ]
  });
  await ensureTenantRoot(tenant._id);

  logger.warn('Created default tenant. SAVE THESE KEYS — they are stored hashed and cannot be shown again:');
  logger.warn(`  admin key:  ${adminKey}`);
  logger.warn(`  member key: ${memberKey}`);

  return tenant;
}

const generateKey = (role) =>
  `cfy_${role}_${crypto.randomBytes(24).toString('base64url')}`;

/**
 * Cloud-tier seam. The OSS core enforces no limits; the hosted (paid)
 * edition replaces this module to meter documents, storage, and chat turns
 * against tenant.plan. Services call it at every billable action so the
 * cloud edition attaches here without forking any logic.
 *
 * @param {{ id: string, plan: string }} _tenant
 * @param {'document.upload' | 'chat.message'} _action
 */
export function assertWithinQuota(_tenant, _action) {
  // no-op in the open-source core
}

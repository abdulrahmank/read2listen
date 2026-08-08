import express from 'express';

/**
 * Who am I: lets the SPA show the tenant name and adapt to the key's role
 * (e.g. hide document management from member keys).
 */
export function createTenantRoutes() {
  const router = express.Router();

  router.get('/tenant', (req, res) => {
    res.json({
      success: true,
      tenant: { name: req.tenant.name, plan: req.tenant.plan },
      role: req.role
    });
  });

  return router;
}

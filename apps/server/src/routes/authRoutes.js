import express from 'express';
import { asyncHandler } from '../errorHandler.js';

export function createAuthRoutes(login) {
  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer'); next(); });
  router.get('/config', (req, res) => res.json({ googleEnabled: !!login?.provider }));
  router.get('/session', asyncHandler(async (req, res) => {
    const session = await login?.session(req);
    res.json(session ? { authenticated: true, user: session.user, tenant: session.tenant, role: session.role, csrfToken: session.csrfToken }
      : { authenticated: false });
  }));
  router.get('/google', asyncHandler(async (req, res) => {
    if (!login?.provider) return res.redirect('/login?error=unavailable');
    res.redirect(await login.start(req, res));
  }));
  router.get('/google/callback', asyncHandler(async (req, res) => {
    try { res.redirect(await login.complete(req, res)); }
    catch { res.redirect(`${login?.config.origin || ''}/login?error=google_signin`); }
  }));
  router.post('/logout', asyncHandler(async (req, res) => {
    await login?.logout(req, res);
    res.json({ success: true });
  }));
  return router;
}

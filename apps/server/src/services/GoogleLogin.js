import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { hashKey } from '../auth.js';
import { toTenantDto } from '../models/tenant.model.js';
import { HttpError } from '../errorHandler.js';

const random = () => crypto.randomBytes(32).toString('base64url');
export function equalToken(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length > 0 &&
    Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
export function safeReturnPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return '/';
  const url = new URL(value, 'https://app.invalid');
  return url.origin === 'https://app.invalid' && url.pathname !== '/login' ? url.pathname + url.search + url.hash : '/';
}
export function readCookie(req, name) {
  const part = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  const token = part?.slice(name.length + 1);
  return token && /^[a-zA-Z0-9_-]{43}$/.test(token) ? token : null;
}
export function googleConfig(env = process.env) {
  const hasClient = !!env.GOOGLE_CLIENT_ID;
  const hasSecret = !!env.GOOGLE_CLIENT_SECRET;
  if (hasClient !== hasSecret || (hasClient && !env.PUBLIC_APP_URL)) {
    throw new Error('Google login requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and PUBLIC_APP_URL');
  }
  const url = new URL(env.PUBLIC_APP_URL || 'http://localhost:3000');
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('PUBLIC_APP_URL must be an HTTPS origin (HTTP is allowed only for local development)');
  }
  return { origin: url.origin, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}
export class GoogleProvider {
  constructor(config) {
    this.clientId = config.clientId;
    this.redirectUri = `${config.origin}/api/auth/google/callback`;
    this.client = new OAuth2Client(config.clientId, config.clientSecret, this.redirectUri);
  }
  authorize({ state, nonce, challenge }) {
    return this.client.generateAuthUrl({ scope: ['openid', 'email', 'profile'], state, nonce,
      code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account', access_type: 'online' });
  }
  async identity(code, codeVerifier) {
    const { tokens } = await this.client.getToken({ code, codeVerifier, redirect_uri: this.redirectUri });
    if (!tokens.id_token) throw new Error('Google did not return an identity token');
    const ticket = await this.client.verifyIdToken({ idToken: tokens.id_token, audience: this.clientId });
    return ticket.getPayload();
  }
}

export class GoogleLogin {
  constructor({ tenantRepo, sessionRepo, config, provider }) {
    Object.assign(this, { tenantRepo, sessionRepo, config });
    this.provider = provider || (config.clientId ? new GoogleProvider(config) : null);
    this.secure = config.origin.startsWith('https:');
    this.sessionCookie = this.secure ? '__Host-read2listen_session' : 'read2listen_session';
    this.stateCookie = this.secure ? '__Host-read2listen_oauth' : 'read2listen_oauth';
    this.cookieOptions = { httpOnly: true, secure: this.secure, sameSite: 'lax', path: '/' };
  }
  async start(req, res) {
    if (!this.provider) throw new HttpError(503, 'Google sign-in is not configured on this server');
    const previous = readCookie(req, this.stateCookie);
    if (previous) await this.sessionRepo.remove(hashKey(previous));
    const state = random();
    const verifier = random();
    const nonce = random();
    await this.sessionRepo.create({ _id: hashKey(state), kind: 'oauth', verifier, nonce,
      returnTo: safeReturnPath(req.query.next), expiresAt: new Date(Date.now() + 10 * 60000) });
    res.cookie(this.stateCookie, state, { ...this.cookieOptions, maxAge: 10 * 60000 });
    return this.provider.authorize({ state, nonce, challenge: crypto.createHash('sha256').update(verifier).digest('base64url') });
  }
  async complete(req, res) {
    res.clearCookie(this.stateCookie, this.cookieOptions);
    const state = readCookie(req, this.stateCookie);
    if (!this.provider || !equalToken(state, req.query.state)) throw new Error('Invalid OAuth state');
    const flow = await this.sessionRepo.consume(hashKey(state), 'oauth');
    if (!flow || typeof req.query.code !== 'string' || req.query.error) throw new Error('Expired or cancelled sign-in');
    const identity = await this.provider.identity(req.query.code, flow.verifier);
    if (!identity || typeof identity.sub !== 'string' || !identity.sub || identity.email_verified !== true ||
        typeof identity.email !== 'string' || !equalToken(identity.nonce, flow.nonce)) throw new Error('Invalid Google identity');
    // Stable provider subject, never email or an existing API-key tenant.
    const tenant = await this.tenantRepo.findOrCreateGoogle(identity.sub, identity.name || 'My');
    const previous = readCookie(req, this.sessionCookie);
    if (previous) await this.sessionRepo.remove(hashKey(previous));
    const token = random();
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600000);
    await this.sessionRepo.create({ _id: hashKey(token), kind: 'session', tenantId: tenant._id,
      user: { name: identity.name || identity.email, email: identity.email }, csrfToken: random(), expiresAt });
    res.cookie(this.sessionCookie, token, { ...this.cookieOptions, maxAge: 7 * 24 * 3600000 });
    return this.config.origin + flow.returnTo;
  }
  async session(req) {
    const token = readCookie(req, this.sessionCookie);
    if (!token) return null;
    const session = await this.sessionRepo.find(hashKey(token), 'session');
    if (!session) return null;
    const tenant = await this.tenantRepo.findById(session.tenantId);
    if (!tenant) return null;
    return { ...session, tenant: toTenantDto(tenant), role: 'admin' };
  }
  verifyCsrf(req, session) {
    if (!equalToken(req.headers['x-csrf-token'], session.csrfToken) ||
        (req.headers.origin && req.headers.origin !== this.config.origin)) throw new HttpError(403, 'Invalid session request. Refresh the page and try again.');
  }
  async logout(req, res) {
    const session = await this.session(req);
    if (session) {
      this.verifyCsrf(req, session);
      await this.sessionRepo.remove(session._id);
    }
    res.clearCookie(this.sessionCookie, this.cookieOptions);
  }
}

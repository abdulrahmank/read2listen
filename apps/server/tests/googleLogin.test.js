import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { createTestContext, cleanupTestContext, uploadDocument, KEYS } from './helpers.js';
import { InMemorySessionRepo } from './fakes/repos.js';
import { hashKey } from '../src/auth.js';
import { googleConfig, safeReturnPath } from '../src/services/GoogleLogin.js';

class FakeGoogle {
  authorize(params) { this.params = params; return 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(params); }
  async identity(code, verifier) {
    this.verifier = verifier;
    if (this.reject) throw new Error('Invalid signature or audience');
    return { sub: this.sub || 'google-one', email: 'reader@example.com', email_verified: true, name: 'Reader', nonce: this.params.nonce, ...this.overrides };
  }
}
const cookie = (response, name) => response.headers['set-cookie'].find(value => value.startsWith(name + '=')).split(';')[0];
describe('Google login and session authentication', () => {
  let ctx, sessions, provider;
  beforeEach(async () => {
    sessions = new InMemorySessionRepo(); provider = new FakeGoogle();
    ctx = await createTestContext({ loginOptions: { sessionRepo: sessions, provider, config: { origin: 'https://read2listen.com' } } });
  });
  afterEach(async () => { await cleanupTestContext(ctx); });
  async function begin(next = '/') {
    const result = await request(ctx.app).get('/api/auth/google').query({ next });
    const state = new URL(result.headers.location).searchParams.get('state');
    return { state, stateCookie: cookie(result, ctx.login.stateCookie), result };
  }
  async function complete(flow) {
    return request(ctx.app).get('/api/auth/google/callback').query({ state: flow.state, code: 'valid-code' }).set('Cookie', flow.stateCookie);
  }
  async function signin() {
    const flow = await begin();
    const result = await complete(flow);
    return { result, sessionCookie: cookie(result, ctx.login.sessionCookie), flow };
  }
  test('authorization uses state, nonce and PKCE, and only hashed state is stored', async () => {
    const { result, state } = await begin('/reader/example');
    expect(result.status).toBe(302);
    expect(provider.params.nonce).toBeTruthy();
    expect(provider.params.challenge).toHaveLength(43);
    expect(sessions.records.has(state)).toBe(false);
    expect(sessions.records.get(hashKey(state)).returnTo).toBe('/reader/example');
    expect(result.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(result.headers['set-cookie'][0]).toMatch(/Secure/);
    expect(result.headers['set-cookie'][0]).toMatch(/SameSite=Lax/);
  });
  test('login creates private library, restores sessions and enables protected document uploads with CSRF', async () => {
    const { sessionCookie, result } = await signin();
    expect(result.headers.location).toBe('https://read2listen.com/');
    const state = await request(ctx.app).get('/api/auth/session').set('Cookie', sessionCookie);
    expect(state.body.authenticated).toBe(true);
    expect(state.body.user.email).toBe('reader@example.com');
    expect(state.body.tenant.id).not.toBe(ctx.tenants.acme._id);
    expect(state.headers['cache-control']).toBe('no-store');
    expect((await request(ctx.app).get('/api/documents').set('Cookie', sessionCookie)).status).toBe(200);
    const uploaded = await request(ctx.app).post('/api/documents').set('Cookie', sessionCookie)
      .set('Origin', 'https://read2listen.com').set('X-CSRF-Token', state.body.csrfToken).attach('file', Buffer.from('Hello'), 'reader.txt');
    expect(uploaded.status).toBe(201);
    const another = await signin();
    const second = await request(ctx.app).get('/api/auth/session').set('Cookie', another.sessionCookie);
    expect(second.body.tenant.id).toBe(state.body.tenant.id);
  });
  test('callbacks reject mismatched, expired and replayed state, unverified email and invalid nonce', async () => {
    const flow = await begin();
    const mismatched = await request(ctx.app).get('/api/auth/google/callback').query({ state: 'wrong', code: 'code' }).set('Cookie', flow.stateCookie);
    expect(mismatched.headers.location).toContain('error=google_signin');
    sessions.records.get(hashKey(flow.state)).expiresAt = new Date(0);
    expect((await complete(flow)).headers.location).toContain('error=google_signin');
    for (const overrides of [{ email_verified: false }, { nonce: 'invalid' }, { sub: '' }]) {
      provider.overrides = overrides;
      expect((await complete(await begin())).headers.location).toContain('error=google_signin');
    }
    provider.overrides = {};
    const valid = await begin();
    expect((await complete(valid)).headers.location).toBe('https://read2listen.com/');
    expect((await complete(valid)).headers.location).toContain('error=google_signin');
  });
  test('Google token verification errors never create an authenticated session', async () => {
    provider.reject = true;
    expect((await complete(await begin())).headers.location).toContain('error=google_signin');
    expect([...sessions.records.values()].filter(record => record.kind === 'session')).toHaveLength(0);
  });
  test('protects mutation and logout from CSRF and revokes sessions on logout', async () => {
    const { sessionCookie } = await signin();
    const status = await request(ctx.app).get('/api/auth/session').set('Cookie', sessionCookie);
    expect((await request(ctx.app).post('/api/chats').set('Cookie', sessionCookie).send({})).status).toBe(403);
    expect((await request(ctx.app).post('/api/auth/logout').set('Cookie', sessionCookie)).status).toBe(403);
    expect((await request(ctx.app).post('/api/auth/logout').set('Cookie', sessionCookie).set('Origin', 'https://evil.example')
      .set('X-CSRF-Token', status.body.csrfToken)).status).toBe(403);
    expect((await request(ctx.app).post('/api/auth/logout').set('Cookie', sessionCookie)
      .set('X-CSRF-Token', status.body.csrfToken)).status).toBe(200);
    expect((await request(ctx.app).get('/api/documents').set('Cookie', sessionCookie)).status).toBe(401);
  });
  test('expired sessions cannot read, and Google users cannot access API-key or other Google libraries', async () => {
    const uploaded = await uploadDocument(request, ctx.app, KEYS.acmeAdmin);
    const first = await signin();
    expect((await request(ctx.app).get(`/api/documents/${uploaded.body.document.id}/content`).set('Cookie', first.sessionCookie)).status).toBe(404);
    const firstStatus = (await request(ctx.app).get('/api/auth/session').set('Cookie', first.sessionCookie)).body;
    const created = await request(ctx.app).post('/api/documents').set('Cookie', first.sessionCookie).set('X-CSRF-Token', firstStatus.csrfToken).attach('file', Buffer.from('private'), 'private.txt');
    provider.sub = 'google-two';
    const second = await signin();
    expect((await request(ctx.app).get(`/api/documents/${created.body.document.id}/content`).set('Cookie', second.sessionCookie)).status).toBe(404);
    for (const record of sessions.records.values()) if (record.kind === 'session') record.expiresAt = new Date(0);
    expect((await request(ctx.app).get('/api/documents').set('Cookie', first.sessionCookie)).status).toBe(401);
  });
  test('rejects unsafe deployment origins and external return redirects', () => {
    for (const next of ['https://evil.example', '//evil.example', '/\\evil.example', '/login', '/\n/evil']) expect(safeReturnPath(next)).toBe('/');
    expect(safeReturnPath('/reader/doc?part=2')).toBe('/reader/doc?part=2');
    expect(() => googleConfig({ GOOGLE_CLIENT_ID: 'id' })).toThrow();
    expect(() => googleConfig({ PUBLIC_APP_URL: 'http://read2listen.com' })).toThrow();
    expect(googleConfig({ PUBLIC_APP_URL: 'http://localhost:5173' }).origin).toBe('http://localhost:5173');
  });
});

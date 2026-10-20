import crypto from 'node:crypto';

const OAUTH_WINDOW = 10 * 60_000;
const ADMIN_READ_WINDOW = 4 * 60 * 60_000;
const ADMIN_WRITE_WINDOW = 15 * 60_000;
const callback = fn => new Promise((resolve, reject) => fn(error => error ? reject(error) : resolve()));
const list = value => String(value || '').split(',').map(s => s.trim()).filter(Boolean);
const email = value => typeof value === 'string' ? value.trim().toLowerCase() : '';

export async function migrateAuthentication(pool) {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE');
  await pool.query(`CREATE TABLE IF NOT EXISTS oauth_login_attempts (
    state_hash TEXT PRIMARY KEY,session_hash TEXT NOT NULL,provider TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL);
    CREATE INDEX IF NOT EXISTS oauth_login_expiry ON oauth_login_attempts(expires_at)`);
}

export function isAdminIdentity(user, config = process.env) {
  if (!user || user.status !== 'active') return false;
  return /^\d{17,20}$/.test(String(user.discord_id)) && list(config.ADMIN_DISCORD_IDS).includes(String(user.discord_id)) ||
    user.email_verified === true && Boolean(email(user.email)) && list(config.ADMIN_EMAILS).map(email).includes(email(user.email));
}

export function safeReturnTo(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (!value.startsWith('/') || decoded.startsWith('//') || /[\\\x00-\x20\x7f]/.test(decoded)) return null;
    if (new URL(value, 'https://diskoko.invalid').origin !== 'https://diskoko.invalid') return null;
    return value;
  } catch { return null; }
}

export function adminSessionFresh(session, user, {write = false, now = Date.now()} = {}) {
  const auth = session?.authentication;
  if (!auth || !Number.isFinite(auth.at) || String(auth.userId) !== String(user?.id)) return false;
  const subject = auth.provider === 'discord' ? user?.discord_id : auth.provider === 'google' ? user?.google_id : null;
  if (!subject || auth.subject !== String(subject)) return false;
  const age = now - auth.at;
  return Number.isFinite(age) && age >= 0 && age <= (write ? ADMIN_WRITE_WINDOW : ADMIN_READ_WINDOW);
}

export function adminReauthUrl(session) {
  return '/auth/' + (session?.authentication?.provider === 'google' ? 'google' : 'discord') + '?returnTo=%2Fadmin';
}

export function checkAdminSession(req, res, user, options = {}) {
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (adminSessionFresh(req.session, user, {write, ...options})) return true;
  res.status(401).json({error: 'أعد تسجيل الدخول لتأكيد هويتك قبل متابعة إدارة الموقع. لم يُنفذ الطلب؛ راجعه مجددًا بعد الدخول.', code: 'ADMIN_REAUTH_REQUIRED', reauthUrl: adminReauthUrl(req.session)});
  return false;
}

export function requireSiteAdmin(requireUser, config = process.env, now = Date.now) {
  return (req, res, next) => requireUser(req, res, () => {
    if (!isAdminIdentity(req.user, config)) return res.status(403).json({error: 'غير مصرح'});
    if (checkAdminSession(req, res, req.user, {now: now()})) next();
  });
}

export function csrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  return req.session.csrfToken;
}

export function csrfProtection(allowedOrigins, workerAuthorized = () => false) {
  return (req, res, next) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (req.path === '/webhooks/billing') return next();
    if (req.path.startsWith('/ai/worker/') && workerAuthorized(req)) return next();
    const origin = req.get('origin');
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({error: 'مصدر الطلب غير مسموح'});
    const token = req.get('x-csrf-token');
    if (!token || token !== csrfToken(req)) return res.status(403).json({error: 'رمز حماية الطلب غير صالح أو مفقود'});
    next();
  };
}

export function privateAuthResponses(_req, res, next) {
  res.set('Cache-Control', 'no-store, max-age=0'); res.set('Pragma', 'no-cache'); res.vary('Cookie'); next();
}

async function rotateLogin(req, user, provider, subject, now) {
  // Regenerate destroys the previous store entry. Never copy arbitrary session state.
  await callback(done => req.session.regenerate(done));
  req.session.userId = user.id;
  req.session.authentication = {userId: String(user.id), provider, subject: String(subject), at: now};
  await callback(done => req.session.save(done));
}

function oauthAttempt(req, provider, now) {
  const attempt = req.session.oauthAttempt;
  const age = now - attempt?.at;
  if (!attempt || attempt.provider !== provider || typeof req.query.code !== 'string' || !req.query.code || req.query.code.length > 4096 ||
      typeof req.query.state !== 'string' || !/^[a-f0-9]{48}$/.test(req.query.state) || typeof attempt.state !== 'string' || req.query.state.length !== attempt.state.length ||
      !crypto.timingSafeEqual(Buffer.from(req.query.state), Buffer.from(attempt.state)) || !Number.isFinite(age) || age < 0 || age > OAUTH_WINDOW) return null;
  return attempt;
}

export function mountAuthentication(app, {
  pool, rateLimit, encrypt, audit, requestCustomerRoleSync, sendWelcomeEmail,
  baseUrl, isProduction = false, config = process.env, request = fetch, now = Date.now,
}) {
  const get = async (url, options = {}) => {
    const response = await request(url, {...options, signal: AbortSignal.timeout(12_000)});
    if (!response.ok) throw new Error('Identity provider request failed');
    return response.json();
  };
  const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const provider of ['discord', 'google']) {
    app.get('/auth/' + provider, rateLimit(12, 60_000), route(async (req, res) => {
      if (provider === 'google' && !config.GOOGLE_CLIENT_ID) return res.status(503).send('تسجيل Google غير مفعّل بعد');
      if (provider === 'discord' && req.session.userId) {
        const user = (await pool.query('SELECT * FROM users WHERE id=$1', [req.session.userId])).rows[0];
        if (!user || user.status !== 'active') return res.status(403).send('الحساب غير متاح. أعد تسجيل الدخول أو تواصل مع الدعم.');
        if (!user.discord_id && !adminSessionFresh(req.session,user,{write:true,now:now()})) {
          // Linking a new login identity requires a recent proof of the existing account.
          const back = '/auth/discord' + (safeReturnTo(req.query.returnTo) ? '?returnTo=' + encodeURIComponent(req.query.returnTo) : '');
          return res.redirect('/auth/google?returnTo=' + encodeURIComponent(back));
        }
      }
      const state = crypto.randomBytes(24).toString('hex');
      req.session.oauthAttempt = {provider, state, at: now(), returnTo: safeReturnTo(req.query.returnTo),
        ...(provider === 'discord' && req.session.userId ? {linkUserId: req.session.userId} : {})};
      await callback(done => req.session.save(done));
      await pool.query('DELETE FROM oauth_login_attempts WHERE expires_at <= NOW()');
      await pool.query('INSERT INTO oauth_login_attempts(state_hash,session_hash,provider,expires_at) VALUES($1,$2,$3,$4)', [hash(state),hash(req.sessionID),provider,new Date(now()+OAUTH_WINDOW)]);
      const params = new URLSearchParams({client_id: config[provider === 'discord' ? 'DISCORD_CLIENT_ID' : 'GOOGLE_CLIENT_ID'] || '',
        redirect_uri: `${baseUrl}/auth/${provider}/callback`, response_type: 'code',
        scope: provider === 'discord' ? 'identify email guilds' : 'openid email profile', state,
        prompt: provider === 'discord' ? 'consent' : 'select_account'});
      res.redirect((provider === 'discord' ? 'https://discord.com/oauth2/authorize?' : 'https://accounts.google.com/o/oauth2/v2/auth?') + params);
    }));
    app.get(`/auth/${provider}/callback`, rateLimit(20, 60_000), route(async (req, res) => {
      const attempt = oauthAttempt(req, provider, now());
      if (!attempt) return res.status(400).send('طلب تسجيل الدخول غير صالح أو انتهت صلاحيته. ابدأ تسجيل الدخول من جديد.');
      // A shared database claim prevents two parallel callbacks from exchanging the same flow.
      const claim = await pool.query('DELETE FROM oauth_login_attempts WHERE state_hash=$1 AND session_hash=$2 AND provider=$3 AND expires_at>NOW() RETURNING state_hash', [hash(attempt.state),hash(req.sessionID),provider]);
      if (!claim.rowCount) return res.status(400).send('انتهى طلب تسجيل الدخول أو استُخدم سابقًا. ابدأ من جديد.');
      delete req.session.oauthAttempt;
      await callback(done => req.session.save(done));
      const tokens = await get(provider === 'discord' ? 'https://discord.com/api/oauth2/token' : 'https://oauth2.googleapis.com/token', {
        method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({client_id: config[provider === 'discord' ? 'DISCORD_CLIENT_ID' : 'GOOGLE_CLIENT_ID'],
          client_secret: config[provider === 'discord' ? 'DISCORD_CLIENT_SECRET' : 'GOOGLE_CLIENT_SECRET'],
          grant_type: 'authorization_code', code: req.query.code, redirect_uri: `${baseUrl}/auth/${provider}/callback`}),
      });
      if (typeof tokens.access_token !== 'string' || !tokens.access_token) throw Error('Missing identity provider token');
      const profile = await get(provider === 'discord' ? 'https://discord.com/api/v10/users/@me' : 'https://openidconnect.googleapis.com/v1/userinfo', {headers: {Authorization: `Bearer ${tokens.access_token}`}});
      const subject = provider === 'discord' ? profile.id : profile.sub;
      if (typeof subject !== 'string' || (provider === 'discord' ? !/^\d{17,20}$/.test(subject) : !subject.trim() || subject.length > 255)) throw Error('Invalid identity provider subject');
      const verified = Boolean(profile.email) && (provider === 'discord' ? profile.verified === true : profile.email_verified === true);
      let rows;
      if (provider === 'discord') {
        const seconds = Number(tokens.expires_in ?? 604800);
        if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 365 * 86400) throw Error('Invalid identity token expiry');
        const expires = new Date(now() + seconds * 1000);
        if (attempt.linkUserId) {
          // The callback cannot link into another session/account, even if a flow was started earlier.
          if (String(req.session.userId) !== String(attempt.linkUserId)) return res.status(401).send('انتهت جلسة الحساب. سجّل الدخول مجددًا.');
          const current = (await pool.query('SELECT id,discord_id FROM users WHERE id=$1', [attempt.linkUserId])).rows[0];
          if (!current) return res.status(401).send('انتهت جلسة الحساب. سجّل الدخول مجددًا.');
          const existing = (await pool.query('SELECT id FROM users WHERE discord_id=$1', [subject])).rows[0];
          if (existing && String(existing.id) !== String(attempt.linkUserId)) return res.status(409).send('حساب Discord مرتبط بحساب آخر. تواصل مع الدعم لدمج الحسابين.');
          if (current.discord_id && current.discord_id !== subject) return res.status(409).send('حسابك مرتبط بحساب Discord مختلف. تواصل مع الدعم لتغييره.');
          ({rows} = await pool.query(`UPDATE users SET discord_id=$1,access_token=$2,refresh_token=$3,token_expires_at=$4,
            email=CASE WHEN google_id IS NULL THEN $6 ELSE email END,
            email_verified=CASE WHEN google_id IS NULL THEN $7 ELSE email_verified END,
            updated_at=NOW() WHERE id=$5 RETURNING *`, [subject, encrypt(tokens.access_token), encrypt(tokens.refresh_token), expires, attempt.linkUserId, profile.email || null, verified]));
        } else {
          const avatar = profile.avatar ? `https://cdn.discordapp.com/avatars/${subject}/${profile.avatar}.png?size=128` : null;
          ({rows} = await pool.query(`INSERT INTO users(discord_id,username,display_name,avatar,email,access_token,refresh_token,token_expires_at,last_login_at,email_verified)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9) ON CONFLICT(discord_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,avatar=EXCLUDED.avatar,email=EXCLUDED.email,access_token=EXCLUDED.access_token,refresh_token=EXCLUDED.refresh_token,token_expires_at=EXCLUDED.token_expires_at,email_verified=EXCLUDED.email_verified,last_login_at=NOW(),updated_at=NOW() RETURNING *`,
          [subject, profile.username, profile.global_name || profile.username, avatar, profile.email || null, encrypt(tokens.access_token), encrypt(tokens.refresh_token), expires, verified]));
        }
      } else {
        const username = String(profile.email || profile.name || subject).slice(0, 80);
        ({rows} = await pool.query(`INSERT INTO users(google_id,username,display_name,avatar,email,last_login_at,email_verified) VALUES($1,$2,$3,$4,$5,NOW(),$6) ON CONFLICT(google_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name,avatar=EXCLUDED.avatar,email=EXCLUDED.email,email_verified=EXCLUDED.email_verified,last_login_at=NOW(),updated_at=NOW() RETURNING *`,
          [subject, username, profile.name || username, profile.picture || null, profile.email || null, verified]));
      }
      const user = rows[0];
      if (user.status !== 'active') return res.status(403).send('الحساب موقوف. تواصل مع الدعم.');
      await rotateLogin(req, user, provider, subject, now());
      if (provider === 'discord') await requestCustomerRoleSync(user.id);
      // Do not send mail to an unverified address supplied by an identity provider.
      if (user.email_verified === true) void sendWelcomeEmail(user).catch(() => console.error('Welcome email failed'));
      await audit(user.id, provider === 'discord' ? 'login' : 'login.google', 'user', user.id);
      res.redirect(attempt.returnTo || (isAdminIdentity(user, config) ? '/admin' : '/account.html'));
    }));
  }
  app.post('/api/logout', route(async (req, res) => {
    await callback(done => req.session.destroy(done));
    res.clearCookie('diskoko.sid', {path: '/', httpOnly: true, secure: isProduction, sameSite: 'lax'});
    res.json({ok: true});
  }));
}

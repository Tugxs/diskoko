export async function migrateCore(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      discord_id TEXT UNIQUE,
      google_id TEXT UNIQUE,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      email TEXT,
      plan TEXT NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','starter','growth','complete')),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      guild_id TEXT,
      design JSONB NOT NULL DEFAULT '{}'::jsonb,
      deployment_status TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'manual',
      provider_ref TEXT,
      plan TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      current_period_end TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS subscription_events (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      provider_ref TEXT,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider, event_id)
    );
    CREATE TABLE IF NOT EXISTS customer_role_sync (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      revision BIGINT NOT NULL DEFAULT 0
    );
    ALTER TABLE customer_role_sync ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS guild_connections (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
      guild_id TEXT NOT NULL,
      guild_name TEXT,
      install_status TEXT NOT NULL DEFAULT 'discovered',
      bot_user_id TEXT,
      permissions_snapshot TEXT,
      last_error TEXT,
      last_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, guild_id)
    );
    CREATE TABLE IF NOT EXISTS change_sets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
      template_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      plan JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS change_operations (
      id BIGSERIAL PRIMARY KEY,
      change_set_id BIGINT NOT NULL REFERENCES change_sets(id) ON DELETE CASCADE,
      operation_key TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(change_set_id, operation_key)
    );
    CREATE TABLE IF NOT EXISTS usage_events (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      guild_id TEXT,
      event_type TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS custom_templates (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      definition JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS custom_bots (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      definition JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'draft',
      version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, slug)
    );
    CREATE TABLE IF NOT EXISTS bot_guild_settings (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL UNIQUE,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      command_keys JSONB NOT NULL DEFAULT '["help","ping","about"]'::jsonb,
      log_channel_id TEXT,
      locale TEXT NOT NULL DEFAULT 'ar',
      welcome_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS bot_command_daily (
      guild_id TEXT NOT NULL,
      day DATE NOT NULL,
      command_key TEXT NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      failed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, day, command_key)
    );
    CREATE TABLE IF NOT EXISTS template_versions (
      id BIGSERIAL PRIMARY KEY,
      template_id BIGINT NOT NULL REFERENCES custom_templates(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      definition JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(template_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subscription_events_user ON subscription_events(user_id, processed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_guild_connections_user ON guild_connections(user_id);
    CREATE INDEX IF NOT EXISTS idx_change_sets_user ON change_sets(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_custom_templates_user ON custom_templates(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_custom_bots_user ON custom_bots(user_id, updated_at DESC);
    ALTER TABLE custom_bots ADD COLUMN IF NOT EXISTS guild_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_custom_bots_guild ON custom_bots(user_id, guild_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_bot_guild_settings_updated ON bot_guild_settings(updated_at DESC);
  `);
  await pool.query(`
    ALTER TABLE users ALTER COLUMN discord_id DROP NOT NULL;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_check;
    UPDATE users SET plan = CASE plan WHEN 'trial' THEN 'free' WHEN 'complete' THEN 'business' WHEN 'pro' THEN 'growth' WHEN 'studio' THEN 'business' ELSE plan END;
    ALTER TABLE users ALTER COLUMN plan SET DEFAULT 'free';
    ALTER TABLE users ADD CONSTRAINT users_plan_check CHECK (plan IN ('free','starter','growth','business'));
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT NOT NULL DEFAULT 'monthly';
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ;
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS amount_sar INTEGER;
    ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'SAR';
    ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    UPDATE subscriptions SET plan = CASE plan WHEN 'trial' THEN 'free' WHEN 'complete' THEN 'business' WHEN 'pro' THEN 'growth' WHEN 'studio' THEN 'business' ELSE plan END;
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL, provider_ref TEXT NOT NULL, status TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'SAR', invoice_url TEXT,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), paid_at TIMESTAMPTZ,
      UNIQUE(provider,provider_ref)
    );
    CREATE INDEX IF NOT EXISTS idx_billing_invoices_user ON billing_invoices(user_id,issued_at DESC);
    CREATE TABLE IF NOT EXISTS billing_upgrade_requests (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL, billing_interval TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_upgrade_pending ON billing_upgrade_requests(user_id) WHERE status='pending';
    ALTER TABLE billing_upgrade_requests ADD COLUMN IF NOT EXISTS coupon_code TEXT;
    ALTER TABLE billing_upgrade_requests ADD COLUMN IF NOT EXISTS subtotal INTEGER;
    ALTER TABLE billing_upgrade_requests ADD COLUMN IF NOT EXISTS discount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE billing_upgrade_requests ADD COLUMN IF NOT EXISTS total INTEGER;
    CREATE TABLE IF NOT EXISTS discount_coupons (
      id BIGSERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, discount_type TEXT NOT NULL DEFAULT 'percent',
      discount_value INTEGER NOT NULL, max_redemptions INTEGER, redeemed_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ, active BOOLEAN NOT NULL DEFAULT TRUE, created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS support_reports (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL, subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general', details TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}


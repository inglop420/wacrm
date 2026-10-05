-- ============================================================
-- 044_email_module.sql — Email Templates, Settings & Delivery Logs
--
-- Adds support for:
--   1. email_configs: account-level sender configuration for Resend.
--   2. email_templates: reusable HTML/text email templates with dynamic variables.
--   3. email_logs: tracking sent, delivered, opened, clicked, bounced emails.
--
-- RLS adheres to WACRM multi-tenant rules (migration 017):
--   - Uses is_account_member(account_id, role)
-- ============================================================

-- 1. EMAIL CONFIGURATIONS PER ACCOUNT
CREATE TABLE IF NOT EXISTS email_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  resend_api_key TEXT, -- Optional override; defaults to server env RESEND_API_KEY
  from_name TEXT NOT NULL DEFAULT 'Ventas LEGMA',
  from_email TEXT NOT NULL DEFAULT 'notificaciones@crm.legma.com.mx',
  reply_to_email TEXT NOT NULL DEFAULT 'contacto@legma.com.mx',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_configs_account_id_key UNIQUE (account_id)
);

CREATE INDEX IF NOT EXISTS idx_email_configs_account ON email_configs(account_id);

ALTER TABLE email_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_configs_select ON email_configs;
DROP POLICY IF EXISTS email_configs_insert ON email_configs;
DROP POLICY IF EXISTS email_configs_update ON email_configs;
DROP POLICY IF EXISTS email_configs_delete ON email_configs;

CREATE POLICY email_configs_select ON email_configs FOR SELECT USING (is_account_member(account_id));
CREATE POLICY email_configs_insert ON email_configs FOR INSERT WITH CHECK (is_account_member(account_id, 'admin'));
CREATE POLICY email_configs_update ON email_configs FOR UPDATE USING (is_account_member(account_id, 'admin'));
CREATE POLICY email_configs_delete ON email_configs FOR DELETE USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at_email_configs ON email_configs;
CREATE TRIGGER set_updated_at_email_configs BEFORE UPDATE ON email_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- 2. EMAIL TEMPLATES
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_account ON email_templates(account_id);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_templates_select ON email_templates;
DROP POLICY IF EXISTS email_templates_insert ON email_templates;
DROP POLICY IF EXISTS email_templates_update ON email_templates;
DROP POLICY IF EXISTS email_templates_delete ON email_templates;

CREATE POLICY email_templates_select ON email_templates FOR SELECT USING (is_account_member(account_id));
CREATE POLICY email_templates_insert ON email_templates FOR INSERT WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY email_templates_update ON email_templates FOR UPDATE USING (is_account_member(account_id, 'agent'));
CREATE POLICY email_templates_delete ON email_templates FOR DELETE USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at_email_templates ON email_templates;
CREATE TRIGGER set_updated_at_email_templates BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- 3. EMAIL LOGS (Delivery & Tracking)
CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  recipient_email TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  reply_to_email TEXT,
  subject TEXT NOT NULL,
  resend_email_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  error_message TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_account ON email_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_contact ON email_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_deal ON email_logs(deal_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_resend_id ON email_logs(resend_email_id);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_logs_select ON email_logs;
CREATE POLICY email_logs_select ON email_logs FOR SELECT USING (is_account_member(account_id));
-- Inserts and updates to logs are typically handled by service role (engine & webhooks)

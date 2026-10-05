-- ============================================================
-- 045_email_broadcasts.sql — Email Campaigns & Broadcast Support
-- ============================================================

-- 1. Support multi-channel broadcasts (WhatsApp and Email)
ALTER TABLE broadcasts
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp', 'email')),
  ADD COLUMN IF NOT EXISTS email_template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_subject TEXT;

-- 2. Link email_logs to parent broadcast
ALTER TABLE email_logs
  ADD COLUMN IF NOT EXISTS broadcast_id UUID REFERENCES broadcasts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_broadcasts_channel ON broadcasts(channel);
CREATE INDEX IF NOT EXISTS idx_email_logs_broadcast ON email_logs(broadcast_id);

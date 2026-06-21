CREATE TABLE IF NOT EXISTS debug_companions (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  relationship TEXT,
  user_display_name TEXT,
  user_address TEXT,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  appearance JSONB NOT NULL DEFAULT '{}'::jsonb,
  personality TEXT NOT NULL,
  speaking_style TEXT,
  background TEXT,
  custom_instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_companions_owner_idx
ON debug_companions (owner_type, owner_id, updated_at DESC);

-- Backfill local databases that ran an earlier copy of this dev migration
-- before user_address was added to the CREATE TABLE block above.
ALTER TABLE debug_companions
ADD COLUMN IF NOT EXISTS user_address TEXT;

ALTER TABLE debug_companions
  ADD COLUMN IF NOT EXISTS user_display_name TEXT,
  ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS appearance JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS debug_conversations (
  id TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  companion_id TEXT NOT NULL REFERENCES debug_companions(id),
  title TEXT NOT NULL DEFAULT '新对话',
  last_message_preview TEXT,
  emotion_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_conversations_owner_idx
ON debug_conversations (owner_type, owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS debug_conversations_companion_idx
ON debug_conversations (owner_type, owner_id, companion_id);

CREATE TABLE IF NOT EXISTS debug_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES debug_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL,
  error_summary TEXT,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_messages_conversation_idx
ON debug_messages (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS debug_conversation_summaries (
  conversation_id TEXT PRIMARY KEY REFERENCES debug_conversations(id) ON DELETE CASCADE,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  companion_id TEXT NOT NULL,
  summary_content TEXT NOT NULL,
  covered_message_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_conversation_summaries_scope_idx
ON debug_conversation_summaries (owner_type, owner_id, companion_id);

CREATE TABLE IF NOT EXISTS debug_workflow_runs (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES debug_conversations(id) ON DELETE CASCADE,
  user_message_id TEXT NOT NULL REFERENCES debug_messages(id) ON DELETE CASCADE,
  assistant_message_id TEXT REFERENCES debug_messages(id) ON DELETE SET NULL,
  workflow_id TEXT,
  status TEXT NOT NULL,
  model TEXT,
  trace_json JSONB,
  observer_events_json JSONB,
  debug_context_json JSONB,
  memory_snapshot_json JSONB,
  emotion_snapshot_json JSONB,
  tool_snapshot_json JSONB,
  error_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_workflow_runs_conversation_idx
ON debug_workflow_runs (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS debug_workflow_runs_assistant_message_idx
ON debug_workflow_runs (assistant_message_id);

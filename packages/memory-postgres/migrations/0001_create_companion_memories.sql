CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS companion_memories (
  id TEXT PRIMARY KEY,

  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  companion_id TEXT,

  type TEXT NOT NULL,
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 3,

  embedding vector(1536),

  source_conversation_id TEXT,
  source_message_ids JSONB,
  source_reason TEXT,

  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS companion_memories_scope_idx
ON companion_memories (owner_type, owner_id, companion_id);

CREATE INDEX IF NOT EXISTS companion_memories_type_idx
ON companion_memories (type);

CREATE INDEX IF NOT EXISTS companion_memories_importance_idx
ON companion_memories (importance);

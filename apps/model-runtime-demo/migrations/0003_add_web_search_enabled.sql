ALTER TABLE debug_conversations
ADD COLUMN IF NOT EXISTS web_search_enabled BOOLEAN NOT NULL DEFAULT false;

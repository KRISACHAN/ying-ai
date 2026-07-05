ALTER TABLE debug_conversations
ADD COLUMN IF NOT EXISTS web_search_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS debug_workflow_runs_assistant_message_unique_idx
ON debug_workflow_runs (assistant_message_id)
WHERE assistant_message_id IS NOT NULL;

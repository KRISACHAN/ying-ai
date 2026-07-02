CREATE UNIQUE INDEX IF NOT EXISTS debug_workflow_runs_assistant_message_id_unique
ON debug_workflow_runs (assistant_message_id)
WHERE assistant_message_id IS NOT NULL;

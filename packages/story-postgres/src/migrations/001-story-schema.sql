CREATE TABLE IF NOT EXISTS story_sessions (
  id text PRIMARY KEY,
  story_id text NOT NULL,
  definition_version text NOT NULL,
  definition_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS story_states (
  session_id text PRIMARY KEY REFERENCES story_sessions(id) ON DELETE CASCADE,
  schema_version integer NOT NULL,
  state_json jsonb NOT NULL,
  revision bigint NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS story_turns (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES story_sessions(id) ON DELETE CASCADE,
  turn_number integer NOT NULL,
  client_turn_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'committed', 'failed')),
  user_text text NOT NULL,
  assistant_text text,
  plan_json jsonb,
  recalled_lore_json jsonb,
  previous_state_revision bigint NOT NULL,
  next_state_revision bigint,
  state_changed boolean NOT NULL DEFAULT false,
  error_json jsonb,
  created_at timestamptz NOT NULL,
  committed_at timestamptz,
  UNIQUE (session_id, client_turn_id),
  UNIQUE (session_id, turn_number)
);

CREATE TABLE IF NOT EXISTS story_messages (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES story_sessions(id) ON DELETE CASCADE,
  turn_id text NOT NULL REFERENCES story_turns(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  sequence integer NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE (turn_id, role)
);

CREATE TABLE IF NOT EXISTS story_summaries (
  session_id text PRIMARY KEY REFERENCES story_sessions(id) ON DELETE CASCADE,
  through_turn_number integer NOT NULL,
  version bigint NOT NULL,
  summary_text text NOT NULL,
  updated_at timestamptz NOT NULL
);

import { Pool } from "pg";
import { runStoryPostgresMigrations } from "../src/migrations";

declare const process: {
  env: { DATABASE_URL?: string };
  exitCode?: number;
};

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const pool = new Pool({ connectionString });
  try {
    await runStoryPostgresMigrations(pool);
    console.log("story-postgres migrations applied");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

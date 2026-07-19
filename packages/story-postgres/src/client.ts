import type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

export type StoryPostgresClient = Pool | PoolClient;

export interface StoryPostgresQueryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface StoryPostgresTransactable extends StoryPostgresQueryable {
  connect?(): Promise<PoolClient>;
}

export async function withTransaction<T>(
  client: StoryPostgresClient,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  if ("release" in client) {
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  const tx = await client.connect();
  try {
    await tx.query("BEGIN");
    const result = await fn(tx);
    await tx.query("COMMIT");
    return result;
  } catch (error) {
    await tx.query("ROLLBACK");
    throw error;
  } finally {
    tx.release();
  }
}

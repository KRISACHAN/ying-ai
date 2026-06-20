import { DebugRepository } from "../../../../lib/debug-repository";
import { errorResponse, jsonResponse } from "../../../../lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const repository = new DebugRepository();
    const runs = await repository.listRuns(id);

    return jsonResponse({ ok: true, runs });
  } catch (error) {
    return errorResponse(error);
  }
}

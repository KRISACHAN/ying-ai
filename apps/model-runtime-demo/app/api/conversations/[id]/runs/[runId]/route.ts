import { DebugRepository } from "../../../../../lib/debug-repository";
import { errorResponse, jsonResponse } from "../../../../../lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; runId: string }> },
): Promise<Response> {
  try {
    const { id, runId } = await context.params;
    const repository = new DebugRepository();
    const run = await repository.getRun(id, runId);

    if (run === null) {
      return jsonResponse({ ok: false, error: { message: "workflow run not found" } }, 404);
    }

    return jsonResponse({ ok: true, run });
  } catch (error) {
    return errorResponse(error);
  }
}

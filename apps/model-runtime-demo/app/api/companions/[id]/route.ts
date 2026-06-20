import { DebugRepository, validateCompanionPayload } from "../../../lib/debug-repository";
import { errorResponse, jsonResponse } from "../../../lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const repository = new DebugRepository();
    const companion = await repository.getCompanion(id);

    if (companion === null) {
      return jsonResponse({ ok: false, error: { message: "companion not found" } }, 404);
    }

    return jsonResponse({ ok: true, companion });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const payload = validateCompanionPayload(await request.json());
    const repository = new DebugRepository();
    const companion = await repository.updateCompanion(id, payload);

    return jsonResponse({ ok: true, companion });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

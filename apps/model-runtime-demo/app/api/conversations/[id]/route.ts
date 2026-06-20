import { DebugRepository } from "../../../lib/debug-repository";
import { errorResponse, jsonResponse } from "../../../lib/http";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const repository = new DebugRepository();
    const detail = await repository.getConversationDetail(id);

    if (detail === null) {
      return jsonResponse({ ok: false, error: { message: "conversation not found" } }, 404);
    }

    return jsonResponse({ ok: true, ...detail });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const repository = new DebugRepository();
    const deleted = await repository.deleteConversation(id);

    if (!deleted) {
      return jsonResponse({ ok: false, error: { message: "conversation not found" } }, 404);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

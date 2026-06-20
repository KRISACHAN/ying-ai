import { DebugRepository } from "../../lib/debug-repository";
import { errorResponse, jsonResponse } from "../../lib/http";

export async function GET(): Promise<Response> {
  try {
    const repository = new DebugRepository();
    const conversations = await repository.listConversations();

    return jsonResponse({ ok: true, conversations });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const raw = (await request.json()) as { companionId?: unknown };

    if (typeof raw.companionId !== "string" || raw.companionId.trim() === "") {
      return jsonResponse({ ok: false, error: { message: "companionId is required" } }, 400);
    }

    const repository = new DebugRepository();
    const conversation = await repository.createConversation(raw.companionId);

    return jsonResponse({ ok: true, conversation }, 201);
  } catch (error) {
    return errorResponse(error, 400);
  }
}

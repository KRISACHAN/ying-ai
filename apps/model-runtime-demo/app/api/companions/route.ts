import { DebugRepository, validateCompanionPayload } from "../../lib/debug-repository";
import { errorResponse, jsonResponse } from "../../lib/http";

export async function GET(): Promise<Response> {
  try {
    const repository = new DebugRepository();
    const companions = await repository.listCompanions();

    return jsonResponse({ ok: true, companions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const payload = validateCompanionPayload(await request.json());
    const repository = new DebugRepository();
    const companion = await repository.createCompanion(payload);

    return jsonResponse({ ok: true, companion }, 201);
  } catch (error) {
    return errorResponse(error, 400);
  }
}

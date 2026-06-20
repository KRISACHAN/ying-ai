import { errorResponse, jsonResponse } from "../../../../lib/http";
import {
  CompanionMemoryAdminRepository,
  createCompanionMemoryScope,
  normalizeMemoryPayload,
} from "../../../../lib/memory-admin-repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const repository = new CompanionMemoryAdminRepository();
    const memories = await repository.list(createCompanionMemoryScope(id));

    return jsonResponse({ ok: true, memories });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await context.params;
    const payload = normalizeMemoryPayload(await request.json());
    const repository = new CompanionMemoryAdminRepository();
    const memory = await repository.create(payload, createCompanionMemoryScope(id));

    return jsonResponse({ ok: true, memory }, 201);
  } catch (error) {
    return errorResponse(error, 400);
  }
}

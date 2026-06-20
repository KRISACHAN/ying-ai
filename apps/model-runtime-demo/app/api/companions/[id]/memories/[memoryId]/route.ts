import { errorResponse, jsonResponse } from "../../../../../lib/http";
import {
  CompanionMemoryAdminRepository,
  createCompanionMemoryScope,
  normalizeMemoryPatch,
} from "../../../../../lib/memory-admin-repository";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; memoryId: string }> },
): Promise<Response> {
  try {
    const { id, memoryId } = await context.params;
    const patch = normalizeMemoryPatch(await request.json());
    const repository = new CompanionMemoryAdminRepository();
    const memory = await repository.update(memoryId, patch, createCompanionMemoryScope(id));

    return jsonResponse({ ok: true, memory });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; memoryId: string }> },
): Promise<Response> {
  try {
    const { id, memoryId } = await context.params;
    const repository = new CompanionMemoryAdminRepository();
    const deleted = await repository.remove(memoryId, createCompanionMemoryScope(id));

    if (!deleted) {
      return jsonResponse({ ok: false, error: { message: "memory not found" } }, 404);
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

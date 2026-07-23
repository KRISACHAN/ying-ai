import { StoryDebugRepository } from "../../lib/story-debug-repository";
import { errorResponse, jsonResponse } from "../../lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const repository = new StoryDebugRepository();
    const stories = await repository.listStories();
    return jsonResponse({ ok: true, stories });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { storyId?: unknown };
    if (typeof body.storyId !== "string" || body.storyId.trim() === "") {
      return errorResponse(new Error("storyId is required"), 400);
    }

    const repository = new StoryDebugRepository();
    const session = await repository.createSession(body.storyId.trim());
    return jsonResponse({ ok: true, session });
  } catch (error) {
    return errorResponse(error);
  }
}

import {
  createStoryDefinitionPreview,
  StoryDebugRepository,
} from "../../../lib/story-debug-repository";
import { errorResponse, jsonResponse } from "../../../lib/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const repository = new StoryDebugRepository();
    const detail = await repository.getSessionDetail(id);

    if (detail === null) {
      return errorResponse(new Error("Story session not found"), 404);
    }

    return jsonResponse({
      ok: true,
      session: detail.session,
      latestState: detail.state,
      recentMessages: detail.messages,
      turns: detail.turns,
      summary: detail.summary,
      definitionPreview: createStoryDefinitionPreview(detail.definition),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

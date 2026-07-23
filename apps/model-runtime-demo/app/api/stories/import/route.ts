import type { StoryDefinition } from "@ying-companion/story-core";
import { validateStoryDefinition } from "@ying-companion/story-core";

import { createStoryDefinitionPreview } from "../../../lib/story-debug-repository";
import { errorResponse, jsonResponse } from "../../../lib/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const definition = await request.json();
    const validation = validateStoryDefinition(definition as StoryDefinition);

    if (!validation.valid) {
      return jsonResponse({ ok: false, errors: validation.errors }, 400);
    }

    return jsonResponse({
      ok: true,
      storyId: (definition as StoryDefinition).id,
      preview: createStoryDefinitionPreview(definition as StoryDefinition),
      persisted: false,
    });
  } catch (error) {
    return errorResponse(error, 400);
  }
}

import type { StoryDefinition } from "@ying-companion/story-core";
import { validateStoryDefinition } from "@ying-companion/story-core";

import {
  createStoryDefinitionPreview,
  StoryDebugRepository,
} from "../../../lib/story-debug-repository";
import { errorResponse, jsonResponse } from "../../../lib/http";
import { StoryDefinitionConflictError } from "../../../lib/story-workbench-data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const definition = await request.json();
    const validation = validateStoryDefinition(definition as StoryDefinition);

    if (!validation.valid) {
      return jsonResponse({ ok: false, errors: validation.errors }, 400);
    }

    const repository = new StoryDebugRepository();
    const registration = await repository.registerStoryDefinition(definition as StoryDefinition);

    return jsonResponse({
      ok: true,
      storyId: (definition as StoryDefinition).id,
      definitionVersion: (definition as StoryDefinition).version,
      preview: createStoryDefinitionPreview(definition as StoryDefinition),
      registered: true,
      registration,
      lifetime: "process",
    });
  } catch (error) {
    if (error instanceof StoryDefinitionConflictError) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: "story_definition_conflict",
            message: error.message,
          },
        },
        409,
      );
    }
    return errorResponse(error, 400);
  }
}

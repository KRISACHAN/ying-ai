import { z } from "zod";

const storyStateChangeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_scene"), sceneId: z.string() }),
  z.object({ type: z.literal("set_character_alive"), characterId: z.string(), alive: z.boolean() }),
  z.object({
    type: z.literal("set_character_present"),
    characterId: z.string(),
    present: z.boolean(),
  }),
  z.object({ type: z.literal("add_inventory_item"), itemId: z.string() }),
  z.object({ type: z.literal("remove_inventory_item"), itemId: z.string() }),
  z.object({ type: z.literal("add_clue"), clueId: z.string() }),
  z.object({ type: z.literal("add_event"), eventId: z.string() }),
  z.object({ type: z.literal("set_relationship"), characterId: z.string(), value: z.number() }),
  z.object({
    type: z.literal("set_attr"),
    key: z.string(),
    scopeRef: z.string().optional(),
    value: z.union([z.boolean(), z.number(), z.string()]),
  }),
]);

export const storyTurnPlanSchema = z.object({
  interpretedAction: z.object({
    raw: z.string(),
    summary: z.string(),
    kind: z.enum(["dialogue", "investigate", "travel", "use_item", "other", "rejected"]),
  }),
  activeCharacterIds: z.array(z.string()),
  narrativeBeat: z.object({
    summary: z.string(),
    tension: z.enum(["low", "medium", "high"]).optional(),
  }),
  stateChanges: z.array(storyStateChangeSchema),
  triggeredEventIds: z.array(z.string()),
  revealedLoreIds: z.array(z.string()),
  rejection: z
    .object({
      reason: z.string(),
      inWorldGuidance: z.string(),
    })
    .optional(),
  responseGuidance: z.object({
    narratorFocus: z.string(),
    emotionalTone: z.string(),
    mustInclude: z.array(z.string()),
    mustNotReveal: z.array(z.string()),
  }),
});

export type StoryTurnPlanSchema = z.infer<typeof storyTurnPlanSchema>;

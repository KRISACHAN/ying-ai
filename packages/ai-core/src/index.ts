export type {
  ChatMessage,
  ChatMessageRole,
  ChatModel,
  GenerateInput,
  GenerateOutput,
  GenerateStreamChunk,
  GenerateUsage,
  ModelToolCall,
} from "./abstractions/model";
export { createModel, type CreateModelOptions } from "./factories/model.factory";

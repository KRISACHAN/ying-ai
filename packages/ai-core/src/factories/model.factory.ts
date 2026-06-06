import type { ChatModel } from "../abstractions/model";
import type { OpenAICompatibleConfig } from "../config/model-config";
import { OpenAICompatibleModel } from "../implementations/model/openai";

export type CreateModelOptions = OpenAICompatibleConfig;

// Core 不读取环境变量；业务方必须显式传入配置，方便未来接入不同宿主运行时。
export function createModel(options: CreateModelOptions): ChatModel {
  return new OpenAICompatibleModel(options);
}

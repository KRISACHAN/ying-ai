/**
 * ChatModel 工厂入口。
 *
 * 宿主读取环境变量后以参数传入；本包不读取 process.env。
 */
import type { ChatModel } from "../abstractions/model";
import type { OpenAICompatibleConfig } from "../config/model-config";
import { OpenAICompatibleModel } from "../implementations/model/openai";

export type CreateModelOptions = OpenAICompatibleConfig;

// Core 不读取环境变量；业务方必须显式传入配置，方便未来接入不同宿主运行时。
export function createModel(options: CreateModelOptions): ChatModel {
  return new OpenAICompatibleModel(options);
}

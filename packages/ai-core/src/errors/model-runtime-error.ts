/**
 * 模型运行时统一错误类型。
 *
 * 主模型与降级模型全部重试失败时抛出，errors 数组记录每次尝试的安全摘要。
 */
import type { ModelRuntimeErrorItem } from "../abstractions/model";

export class ModelRuntimeError extends Error {
  /** errors 记录每次主模型/降级模型尝试的失败摘要。 */
  public constructor(
    message: string,
    public readonly errors: ModelRuntimeErrorItem[],
  ) {
    super(message);
    this.name = "ModelRuntimeError";
  }
}

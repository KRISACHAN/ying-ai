import type { ModelRuntimeErrorItem } from "../abstractions/model";

export class ModelRuntimeError extends Error {
  public constructor(
    message: string,
    public readonly errors: ModelRuntimeErrorItem[],
  ) {
    super(message);
    this.name = "ModelRuntimeError";
  }
}

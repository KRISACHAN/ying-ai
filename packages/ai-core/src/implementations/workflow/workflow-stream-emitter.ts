import type { GenerateStreamChunk, ModelToolCall } from "../../abstractions/model";
import type { ToolResult } from "../../abstractions/tool";
import type { ChatWorkflowOutput } from "../../abstractions/workflow";
import type {
  ChatWorkflowStreamEvent,
  SafeWorkflowError,
} from "../../abstractions/workflow-stream";
import type { WorkflowStepName, WorkflowStepStatus } from "../../abstractions/workflow-trace";

interface QueueWaiter {
  resolve(result: IteratorResult<ChatWorkflowStreamEvent>): void;
  reject(error: unknown): void;
}

export class WorkflowStreamEmitter {
  private readonly queue: ChatWorkflowStreamEvent[] = [];
  private readonly waiters: QueueWaiter[] = [];
  private closed = false;
  private terminated = false;
  private failure: unknown;

  public constructor(private readonly workflowId: string) {}

  public emitWorkflowStart(): void {
    this.emit({
      type: "workflow:start",
      workflowId: this.workflowId,
      timestamp: new Date(),
    });
  }

  public emitStepStart(step: WorkflowStepName): void {
    this.emit({
      type: "step:start",
      workflowId: this.workflowId,
      step,
      timestamp: new Date(),
    });
  }

  public emitStepEnd(
    step: WorkflowStepName,
    status: WorkflowStepStatus,
    summary?: Record<string, unknown>,
  ): void {
    this.emit({
      type: "step:end",
      workflowId: this.workflowId,
      step,
      timestamp: new Date(),
      status,
      ...(summary !== undefined ? { summary } : {}),
    });
  }

  public emitTextDelta(chunk: GenerateStreamChunk): void {
    if (chunk.text.length === 0) {
      return;
    }

    this.emit({
      type: "text:delta",
      workflowId: this.workflowId,
      text: chunk.text,
      ...(chunk.model !== undefined ? { model: chunk.model } : {}),
    });
  }

  public emitToolCall(call: ModelToolCall): void {
    this.emit({
      type: "tool:call",
      workflowId: this.workflowId,
      call,
    });
  }

  public emitToolResult(result: ToolResult): void {
    this.emit({
      type: "tool:result",
      workflowId: this.workflowId,
      result,
    });
  }

  public emitFinish(output: ChatWorkflowOutput): void {
    this.emitTerminal({
      type: "workflow:finish",
      workflowId: this.workflowId,
      output,
    });
  }

  public emitError(error: SafeWorkflowError): void {
    this.emitTerminal({
      type: "workflow:error",
      workflowId: this.workflowId,
      error,
    });
  }

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.flushWaiters();
  }

  public fail(error: unknown): void {
    if (this.closed) {
      return;
    }

    this.failure = error;
    this.closed = true;
    this.flushWaiters();
  }

  public async *events(): AsyncIterable<ChatWorkflowStreamEvent> {
    while (true) {
      const result = await this.nextEvent();

      if (result.done === true) {
        return;
      }

      yield result.value;
    }
  }

  private emit(event: ChatWorkflowStreamEvent): void {
    if (this.closed || this.terminated) {
      return;
    }

    this.push(event);
  }

  private emitTerminal(event: ChatWorkflowStreamEvent): void {
    if (this.closed || this.terminated) {
      return;
    }

    this.terminated = true;
    this.push(event);
    this.close();
  }

  private push(event: ChatWorkflowStreamEvent): void {
    const waiter = this.waiters.shift();

    if (waiter !== undefined) {
      waiter.resolve({ done: false, value: event });
      return;
    }

    this.queue.push(event);
  }

  private nextEvent(): Promise<IteratorResult<ChatWorkflowStreamEvent>> {
    const event = this.queue.shift();

    if (event !== undefined) {
      return Promise.resolve({ done: false, value: event });
    }

    if (this.failure !== undefined) {
      return Promise.reject(this.failure);
    }

    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined });
    }

    return new Promise<IteratorResult<ChatWorkflowStreamEvent>>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  private flushWaiters(): void {
    const waiters = this.waiters.splice(0);

    for (const waiter of waiters) {
      if (this.failure !== undefined) {
        waiter.reject(this.failure);
      } else {
        waiter.resolve({ done: true, value: undefined });
      }
    }
  }
}

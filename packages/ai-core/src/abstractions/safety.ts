/**
 * 内容安全抽象。
 *
 * SafetyProvider 在模型生成前后分别检查用户输入与模型输出；
 * 拒绝时 Workflow 抛错，不返回伪回复。
 */
import type { CoreProvider } from "./provider";

/** 安全检测输入：待检查的文本与会话上下文。 */
export interface SafetyCheckInput {
  text: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/** 安全检测结果；allowed=false 时 Workflow 抛错。 */
export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/** 输入/输出内容安全检测契约。 */
export interface SafetyProvider extends CoreProvider {
  guardInput(input: SafetyCheckInput): Promise<SafetyCheckResult>;
  guardOutput(input: SafetyCheckInput): Promise<SafetyCheckResult>;
}

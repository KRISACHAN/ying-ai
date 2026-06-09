import type { CoreProvider } from "./provider";

export interface SafetyCheckInput {
  text: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface SafetyProvider extends CoreProvider {
  guardInput(input: SafetyCheckInput): Promise<SafetyCheckResult>;
  guardOutput(input: SafetyCheckInput): Promise<SafetyCheckResult>;
}

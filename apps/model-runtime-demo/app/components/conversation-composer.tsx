import type { ChatStatus } from "ai";

import {
  formatWebSearchAvailabilityLabel,
  type WebSearchAvailability,
} from "../lib/web-search-availability";

export function ConversationComposer({
  input,
  status,
  webSearchAvailability,
  webSearchEnabled,
  debugDrawerOpen,
  onWebSearchEnabledChange,
  onDebugOpen,
  onInputChange,
  onSend,
}: {
  input: string;
  status: ChatStatus;
  webSearchAvailability: WebSearchAvailability;
  webSearchEnabled: boolean;
  debugDrawerOpen: boolean;
  onWebSearchEnabledChange(value: boolean): void;
  onDebugOpen(): void;
  onInputChange(value: string): void;
  onSend(): void;
}) {
  const disabled = status === "submitted" || status === "streaming";
  const webSearchDisabled = disabled || !webSearchAvailability.available;

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  return (
    <div className="chat-composer">
      <textarea
        className="chat-input"
        value={input}
        rows={4}
        disabled={disabled}
        placeholder="输入消息，Enter 发送，Shift + Enter 换行"
        onChange={(event) => onInputChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer-actions">
        <label
          className={`web-search-switch${webSearchDisabled ? " web-search-switch-disabled" : ""}`}
          title={formatWebSearchAvailabilityLabel(webSearchAvailability)}
        >
          <input
            type="checkbox"
            checked={webSearchAvailability.available && webSearchEnabled}
            disabled={webSearchDisabled}
            onChange={(event) => onWebSearchEnabledChange(event.target.checked)}
          />
          <span className="switch-track" aria-hidden="true">
            <span />
          </span>
          <span>Web Search</span>
        </label>
        <div className="composer-command-group">
          <button
            className="debug-action-button"
            type="button"
            aria-expanded={debugDrawerOpen}
            aria-controls="conversation-debug-drawer"
            onClick={onDebugOpen}
          >
            调试
          </button>
          <button
            className="button"
            type="button"
            disabled={disabled || input.trim() === ""}
            onClick={onSend}
          >
            {disabled ? "发送中" : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}

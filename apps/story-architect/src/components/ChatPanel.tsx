"use client";

import { Chat, useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { AlertCircle, Send } from "lucide-react";
import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Step } from "@/lib/ai";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  projectId: string;
  step: Step;
  /**
   * Auto-sent on mount as the user's first message, ONLY when messages are empty
   * AND no `greeting` is provided. Used for first-time entry to a step so the
   * AI kicks off immediately.
   */
  kickoffMessage?: string;
  /**
   * Static greeting rendered as an assistant bubble when messages are empty.
   * DOES NOT trigger an AI call. Used when the user navigates back to a
   * step that already has content (view-only mode).
   */
  greeting?: string;
  /** Additional fields merged into every request body (e.g. currentChapterId). */
  body?: Record<string, unknown>;
  onToolUpdated?: (toolName: string) => void;
  /** Expose whether the AI is currently streaming so parents can reflect status. */
  onStatusChange?: (status: "idle" | "streaming") => void;
  /** When true, disable input (e.g. while no chapter is selected). */
  disabled?: boolean;
  disabledReason?: string;
}

export function ChatPanel({
  projectId,
  step,
  kickoffMessage,
  greeting,
  body,
  onToolUpdated,
  onStatusChange,
  disabled = false,
  disabledReason,
}: ChatPanelProps) {
  const [chat] = useState(
    () =>
      new Chat({
        transport: new DefaultChatTransport({
          api: `/api/chat/${projectId}`,
          body: { step, ...(body ?? {}) },
        }),
        ...(onToolUpdated
          ? {
              onToolCall: ({ toolCall }: { toolCall: { toolName: string } }) => {
                onToolUpdated(toolCall.toolName);
              },
            }
          : {}),
      }),
  );

  const { messages, sendMessage, error } = useChat({ chat });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  // Ref-based guard so StrictMode double-invoke never double-sends the kickoff.
  const kickoffSentRef = useRef(false);

  // Track streaming status.
  useEffect(() => {
    return chat["~registerStatusCallback"](() => {
      const s = (chat as unknown as { status: string }).status;
      const next = s === "submitted" || s === "streaming";
      setStreaming((prev) => (prev === next ? prev : next));
    });
  }, [chat]);

  useEffect(() => {
    onStatusChange?.(streaming ? "streaming" : "idle");
  }, [streaming, onStatusChange]);

  // Auto-send the kickoff message once — but only when no static greeting is
  // provided (greeting takes priority for "view-only" steps).
  useEffect(() => {
    if (!kickoffMessage || kickoffSentRef.current) return;
    if (greeting) return;
    kickoffSentRef.current = true;
    sendMessage({ text: kickoffMessage });
  }, [kickoffMessage, greeting, sendMessage]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming, error, greeting]);

  const inputDisabled = disabled || streaming;
  const placeholder = disabled
    ? (disabledReason ?? "请先完成右侧操作")
    : streaming
      ? "AI 正在思考..."
      : "补充你的想法... (Enter 发送，Shift+Enter 换行)";

  const isEmpty = messages.length === 0;

  const submit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = input.trim();
      if (!text || inputDisabled) return;
      setInput("");
      sendMessage({ text });
    },
    [input, inputDisabled, sendMessage],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {/* Static greeting for view-only mode */}
          {isEmpty && greeting && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
                {greeting}
              </div>
            </div>
          )}

          {messages.map((m) => {
            const isUser = m.role === "user";
            const text =
              (m as { parts?: Array<{ type: string; text?: string }> }).parts
                ?.filter((p) => p.type === "text")
                .map((p) => p.text ?? "")
                .join("") ?? "";
            if (!text) return null;
            return (
              <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                  )}
                >
                  <div className="whitespace-pre-wrap">{text}</div>
                </div>
              </div>
            );
          })}
          {streaming &&
            (!messages.length || messages[messages.length - 1]?.role !== "assistant") &&
            !(isEmpty && greeting) && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                  AI 正在思考...
                </div>
              </div>
            )}
          {error && !streaming && (
            <div className="flex justify-start">
              <div className="flex max-w-[85%] items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>AI 响应异常，请重试。</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t bg-background px-4 py-3">
        <form onSubmit={submit} className="mx-auto max-w-2xl">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={2}
              disabled={inputDisabled}
              className="resize-none"
            />
            <Button type="submit" size="icon" disabled={inputDisabled || input.trim().length === 0}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

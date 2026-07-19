export interface StoryMessage {
  id: string;
  sessionId: string;
  turnId: string;
  role: "user" | "assistant";
  content: string;
  sequence: number;
  createdAt: string;
}

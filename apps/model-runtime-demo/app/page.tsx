import { ChatPanel } from "./chat-panel";
import { ModelRuntimePanel } from "./model-runtime-panel";

export default function Page() {
  return (
    <main className="shell">
      <ModelRuntimePanel />
      <ChatPanel />
    </main>
  );
}

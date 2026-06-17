/**
 * NoopCoreObserver — 丢弃所有事件的 Observer 空实现。
 */
import type { CoreEvent, CoreObserver } from "../../abstractions/observer";

/** Observer 空实现：丢弃所有事件，宿主未注入自定义 Observer 时的默认行为。 */
export class NoopCoreObserver implements CoreObserver {
  public readonly meta = {
    id: "observer.noop",
    kind: "observer",
    name: "Noop Core Observer",
  } as const;

  public emit(event: CoreEvent): void {
    void event;
  }
}

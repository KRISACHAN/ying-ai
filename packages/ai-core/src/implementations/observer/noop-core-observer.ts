import type { CoreEvent, CoreObserver } from "../../abstractions/observer";

export class NoopCoreObserver implements CoreObserver {
  public readonly meta = {
    id: "observer.noop",
    kind: "observer",
    name: "Noop Core Observer",
  } as const;

  public emit(event: CoreEvent): void {
    void event;
    // noop
  }
}

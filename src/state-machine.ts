import { EventEmitter } from "./event-emitter";

export interface StateChangeEvent<S extends string> {
  from: S;
  to: S;
}

export class StateMachine<S extends string> {
  private current: S;
  private readonly transitions: Record<S, S[]>;
  private readonly emitter = new EventEmitter<{ change: StateChangeEvent<S> }>();

  constructor(initial: S, transitions: Record<S, S[]>) {
    this.current = initial;
    this.transitions = transitions;
  }

  get state(): S {
    return this.current;
  }

  canTransition(to: S): boolean {
    return (this.transitions[this.current] ?? []).includes(to);
  }

  transition(to: S): void {
    if (!this.canTransition(to)) {
      throw new Error(`[Retouch] Invalid state transition: ${this.current} → ${to}`);
    }
    const from = this.current;
    this.current = to;
    this.emitter.emit("change", { from, to });
  }

  onChange(fn: (data: StateChangeEvent<S>) => void): () => void {
    return this.emitter.on("change", fn);
  }

  destroy(): void {
    this.emitter.removeAll();
  }
}

// biome-ignore lint/suspicious/noExplicitAny: internal event data variance
export class EventEmitter<T extends Record<string, any>> {
  private listeners = new Map<keyof T, Set<(data: never) => void>>();

  on<K extends keyof T>(event: K, fn: (data: T[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event);
    if (set) {
      set.add(fn as (data: never) => void);
    }
    return () => this.listeners.get(event)?.delete(fn as (data: never) => void);
  }

  off<K extends keyof T>(event: K, fn: (data: T[K]) => void): void {
    this.listeners.get(event)?.delete(fn as (data: never) => void);
  }

  emit<K extends keyof T>(event: K, data: T[K]): void {
    for (const fn of this.listeners.get(event) ?? []) {
      (fn as (data: T[K]) => void)(data);
    }
  }

  removeAll(): void {
    this.listeners.clear();
  }
}

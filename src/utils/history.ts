export interface HistoryOptions<T> {
  /** Returns a fresh, independent snapshot of the current state. */
  snapshot: () => T;
  /** Restore a snapshot into the live state and sync the UI. */
  restore: (state: T) => void;
  /** Coalescing window in ms for rapid edits (e.g. slider drags). Default 350. */
  debounceMs?: number;
}

export interface HistoryController<T = unknown> {
  /** Schedule a debounced checkpoint of the current state. */
  record(): void;
  /** Commit any pending debounced checkpoint immediately. */
  flush(): void;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** All checkpoints, oldest first (index 0 = the original state). */
  entries(): readonly T[];
  /** Index of the current state within entries(). */
  cursor(): number;
  /** Restore an arbitrary checkpoint (undo/redo to any point). */
  jumpTo(index: number): boolean;
  /** Subscribe to stack changes (for button enablement). Returns unsubscribe. */
  onChange(fn: () => void): () => void;
  destroy(): void;
}

/**
 * Undo/redo over a single mutable state object. Edits are coalesced via a
 * debounce so a slider drag becomes one checkpoint; a pending edit is flushed
 * before any undo/redo so the gesture lands on a clean boundary.
 */
export function createHistory<T>(options: HistoryOptions<T>): HistoryController<T> {
  const debounceMs = options.debounceMs ?? 350;
  const stack: T[] = [options.snapshot()];
  let index = 0;
  let timer = 0;
  let destroyed = false;
  const listeners = new Set<() => void>();

  function notify(): void {
    for (const fn of listeners) fn();
  }

  function commit(): void {
    timer = 0;
    const next = options.snapshot();
    // No-op edits (Reset with nothing to reset, re-picking the active
    // preset) record nothing — otherwise phantom steps pile up in the
    // history panel with no describable change.
    if (JSON.stringify(next) === JSON.stringify(stack[index])) {
      notify();
      return;
    }
    // Drop any redo tail, then push the new checkpoint.
    stack.length = index + 1;
    stack.push(next);
    index = stack.length - 1;
    notify();
  }

  function flushPending(): void {
    if (timer) {
      clearTimeout(timer);
      commit();
    }
  }

  return {
    record() {
      if (destroyed) return;
      clearTimeout(timer);
      timer = window.setTimeout(commit, debounceMs);
      notify(); // canUndo flips true while an edit is pending
    },
    flush: flushPending,
    undo() {
      flushPending();
      if (index <= 0) return false;
      index--;
      options.restore(stack[index]);
      notify();
      return true;
    },
    redo() {
      flushPending();
      if (index >= stack.length - 1) return false;
      index++;
      options.restore(stack[index]);
      notify();
      return true;
    },
    canUndo() {
      return index > 0 || timer !== 0;
    },
    canRedo() {
      return timer === 0 && index < stack.length - 1;
    },
    entries() {
      return stack.slice();
    },
    cursor() {
      return index;
    },
    jumpTo(target) {
      flushPending();
      if (target < 0 || target >= stack.length || target === index) return false;
      index = target;
      options.restore(stack[index]);
      notify();
      return true;
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      timer = 0;
      listeners.clear();
    },
  };
}

import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get: () => T;
  set: (update: (state: T) => T) => void;
  subscribe: (listener: () => void) => () => void;
}

/** A tiny store: one state object, replaced on every change. */
export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set: (update) => {
      const next = update(state);
      if (next === state) return;
      state = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Reads part of a store. The selector must return a value already in the state (not a new object). */
export function useStore<T, U>(store: Store<T>, selector: (state: T) => U): U {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()));
}

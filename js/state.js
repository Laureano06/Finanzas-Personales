import { StorageService } from './storage.js';

let state = StorageService.load();
const listeners = new Set();

export function getState() {
  return state;
}

export function persist() {
  StorageService.save(state);
  listeners.forEach(fn => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function replaceState(newState) {
  state = newState;
  persist();
}

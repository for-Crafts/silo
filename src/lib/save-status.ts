"use client";
import { useSyncExternalStore } from "react";

type Status = "idle" | "saving" | "saved" | "error";
let status: Status = "idle";
let pending = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function beginSave() {
  pending += 1;
  status = "saving";
  emit();
}
export function endSave(ok: boolean) {
  pending = Math.max(0, pending - 1);
  if (!ok) status = "error";
  else if (pending === 0) status = "saved";
  emit();
}
export function resetSaveStatus() {
  pending = 0;
  status = "idle";
  emit();
}

export function useSaveStatus(): Status {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => "idle"
  );
}

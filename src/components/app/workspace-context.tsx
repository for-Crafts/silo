"use client";
import { createContext, useContext } from "react";
import type { Member } from "@/lib/types";

export type WorkspaceContextValue = {
  workspaceId: string;
  workspaceName: string;
  userId: string;
  email: string;
  role: Member["role"];
  members: Member[];
  inboxInsightId: string | null;
};

const Ctx = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ value, children }: { value: WorkspaceContextValue; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace outside provider");
  return v;
}

export function useMemberEmail() {
  const { members } = useWorkspace();
  return (userId: string | null | undefined) =>
    userId ? (members.find((m) => m.user_id === userId)?.email ?? "不明") : "";
}

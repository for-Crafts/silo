"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontalIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { SAVE_ERROR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Folder, ResearchListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function ResearchSidebar({ folders, researches }: { folders: Folder[]; researches: ResearchListItem[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const folderParam = params.get("folder");
  const { workspaceId } = useWorkspace();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);

  const countBy = (id: string | null) => researches.filter((r) => r.folder_id === id).length;
  const uncategorized = countBy(null);

  async function addFolder() {
    const name = newName.trim();
    if (!name) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("folder")
      .insert({ workspace_id: workspaceId, name, sort_order: folders.length });
    if (error) return toast.error(SAVE_ERROR);
    setNewName("");
    router.refresh();
  }

  async function renameFolder() {
    if (!editing) return;
    const name = editing.name.trim();
    const id = editing.id;
    setEditing(null);
    if (!name) return;
    const { error } = await createClient().from("folder").update({ name }).eq("id", id);
    if (error) return toast.error(SAVE_ERROR);
    router.refresh();
  }

  async function deleteFolder() {
    if (!deleting) return;
    const id = deleting.id;
    setDeleting(null);
    const { error } = await createClient().from("folder").delete().eq("id", id);
    if (error) return toast.error(SAVE_ERROR);
    if (folderParam === id) router.push("/research");
    router.refresh();
  }

  const itemClass = (active: boolean) =>
    cn(
      "group flex h-8 items-center justify-between rounded-md px-2 text-sm",
      active ? "bg-zinc-200/60 font-medium" : "hover:bg-zinc-100"
    );

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-zinc-50 p-3">
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto">
        <Link href="/research" className={itemClass(!folderParam)}>
          <span>すべてのリサーチ</span>
          <span className="text-xs text-muted-foreground">{researches.length}</span>
        </Link>
        {folders.map((f) => {
          const active = folderParam === f.id;
          if (editing?.id === f.id) {
            return (
              <Input
                key={f.id}
                autoFocus
                className="h-8"
                value={editing.name}
                onChange={(e) => setEditing({ id: f.id, name: e.target.value })}
                onBlur={renameFolder}
                onKeyDown={(e) => {
                  if (e.key === "Enter") renameFolder();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            );
          }
          return (
            <Link key={f.id} href={`/research?folder=${f.id}`} className={itemClass(active)}>
              <span className="truncate">{f.name}</span>
              <span className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground group-hover:hidden">{countBy(f.id)}</span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="hidden group-hover:inline-flex data-[state=open]:inline-flex"
                      onClick={(e) => e.preventDefault()}
                    >
                      <MoreHorizontalIcon />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => setEditing({ id: f.id, name: f.name })}>
                      名称を変更
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(f)}>
                      フォルダを削除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </Link>
          );
        })}
        {uncategorized > 0 && (
          <Link href="/research?folder=none" className={itemClass(folderParam === "none")}>
            <span className="text-muted-foreground">未分類</span>
            <span className="text-xs text-muted-foreground">{uncategorized}</span>
          </Link>
        )}
      </nav>
      <Input
        placeholder="＋ フォルダを追加（Enter）"
        className="mt-2 h-8 border-dashed bg-transparent shadow-none"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") addFolder();
        }}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>「{deleting?.name}」を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>中のリサーチは未分類に残ります</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={deleteFolder}>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

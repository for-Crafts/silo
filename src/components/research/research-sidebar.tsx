"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

export type FolderOps = {
  setFolders: (updater: (fs: Folder[]) => Folder[]) => void;
  /** フォルダ削除時、中のリサーチを未分類に移す（ローカル） */
  unfileResearches: (folderId: string) => void;
};

export function ResearchSidebar({
  folders,
  researches,
  ops,
}: {
  folders: Folder[];
  researches: ResearchListItem[];
  ops: FolderOps;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const folderParam = params.get("folder");
  const { workspaceId } = useWorkspace();
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // 以下の操作はすべて「画面を先に更新 → 裏で保存 → 失敗したら元に戻す」
  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const prev = folders;
    const from = folders.findIndex((f) => f.id === active.id);
    const to = folders.findIndex((f) => f.id === over.id);
    const next = arrayMove(folders, from, to).map((f, i) => ({ ...f, sort_order: i }));
    ops.setFolders(() => next);
    const supabase = createClient();
    const changed = next.filter((f, i) => prev.find((p) => p.id === f.id)?.sort_order !== i);
    const results = await Promise.all(changed.map((f) => supabase.from("folder").update({ sort_order: f.sort_order }).eq("id", f.id)));
    if (results.some((r) => r.error)) {
      toast.error(SAVE_ERROR);
      ops.setFolders(() => prev);
    }
  }

  const countBy = (id: string | null) => researches.filter((r) => r.folder_id === id).length;
  const uncategorized = countBy(null);

  async function addFolder() {
    const name = newName.trim();
    if (!name) return;
    const now = new Date().toISOString();
    const folder: Folder = {
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      name,
      sort_order: folders.length,
      created_at: now,
      updated_at: now,
    };
    ops.setFolders((fs) => [...fs, folder]);
    setNewName("");
    const { error } = await createClient()
      .from("folder")
      .insert({ id: folder.id, workspace_id: workspaceId, name, sort_order: folder.sort_order });
    if (error) {
      toast.error(SAVE_ERROR);
      ops.setFolders((fs) => fs.filter((f) => f.id !== folder.id));
    }
  }

  async function renameFolder() {
    if (!editing) return;
    const name = editing.name.trim();
    const id = editing.id;
    setEditing(null);
    const before = folders.find((f) => f.id === id);
    if (!name || !before || before.name === name) return;
    ops.setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name } : f)));
    const { error } = await createClient().from("folder").update({ name }).eq("id", id);
    if (error) {
      toast.error(SAVE_ERROR);
      ops.setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name: before.name } : f)));
    }
  }

  async function deleteFolder() {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    ops.setFolders((fs) => fs.filter((f) => f.id !== target.id));
    ops.unfileResearches(target.id);
    if (folderParam === target.id) router.push("/research");
    const { error } = await createClient().from("folder").delete().eq("id", target.id);
    if (error) {
      toast.error(SAVE_ERROR);
      ops.setFolders((fs) => [...fs, target].sort((a, b) => a.sort_order - b.sort_order));
    }
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
        <DndContext id="folder-sort" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={folders.map((f) => f.id)} strategy={verticalListSortingStrategy}>
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
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) renameFolder();
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                );
              }
              return (
                <SortableFolderRow key={f.id} id={f.id}>
                  <Link href={`/research?folder=${f.id}`} className={itemClass(active)}>
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
                </SortableFolderRow>
              );
            })}
          </SortableContext>
        </DndContext>
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
          if (e.key === "Enter" && !e.nativeEvent.isComposing) addFolder();
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

function SortableFolderRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "z-10 rounded-md bg-background shadow-md")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

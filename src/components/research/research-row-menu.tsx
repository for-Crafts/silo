"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontalIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useWorkspace } from "@/components/app/workspace-context";
import { SAVE_ERROR } from "@/lib/format";
import type { Folder, ResearchListItem } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ResearchOps = {
  setResearches: (updater: (rs: ResearchListItem[]) => ResearchListItem[]) => void;
};

export function ResearchRowMenu({
  research,
  folders,
  ops,
}: {
  research: ResearchListItem;
  folders: Folder[];
  ops: ResearchOps;
}) {
  const { userId } = useWorkspace();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(research.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /** 一覧を先に書き換え、裏で保存。失敗したら元の行に戻す */
  async function update(patch: Partial<ResearchListItem>) {
    const before = research;
    const removed = "deleted_at" in patch && patch.deleted_at;
    ops.setResearches((rs) =>
      removed ? rs.filter((r) => r.id !== research.id) : rs.map((r) => (r.id === research.id ? { ...r, ...patch } : r))
    );
    const { error } = await createClient()
      .from("research_file")
      .update({ ...patch, updated_by: userId })
      .eq("id", research.id);
    if (error) {
      toast.error(SAVE_ERROR);
      ops.setResearches((rs) =>
        removed ? [before, ...rs] : rs.map((r) => (r.id === before.id ? before : r))
      );
      return false;
    }
    return true;
  }

  function submitRename() {
    setRenaming(false);
    if (title.trim() !== research.title) void update({ title: title.trim() });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setTitle(research.title);
              setRenaming(true);
            }}
          >
            名称を変更
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>フォルダを移動</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => update({ folder_id: null })}>未分類</DropdownMenuItem>
              {folders.map((f) => (
                <DropdownMenuItem key={f.id} onSelect={() => update({ folder_id: f.id })}>
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            削除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>名称を変更</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submitRename();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(false)}>
              キャンセル
            </Button>
            <Button
              className="bg-zinc-950"
              onClick={submitRename}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>「{research.title || "無題"}」を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>30 日以内なら復元できます</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction onClick={() => update({ deleted_at: new Date().toISOString() })}>削除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

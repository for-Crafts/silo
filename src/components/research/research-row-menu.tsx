"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function ResearchRowMenu({ research, folders }: { research: ResearchListItem; folders: Folder[] }) {
  const router = useRouter();
  const { userId } = useWorkspace();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(research.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function update(patch: Record<string, unknown>) {
    const { error } = await createClient()
      .from("research_file")
      .update({ ...patch, updated_by: userId })
      .eq("id", research.id);
    if (error) {
      toast.error(SAVE_ERROR);
      return false;
    }
    router.refresh();
    return true;
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
            onKeyDown={async (e) => {
              if (e.key === "Enter" && (await update({ title }))) setRenaming(false);
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(false)}>
              キャンセル
            </Button>
            <Button
              className="bg-zinc-950"
              onClick={async () => {
                if (await update({ title })) setRenaming(false);
              }}
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

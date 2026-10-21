"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandSearch, useCommandSearch } from "@/components/app/command-search";
import { useWorkspace } from "@/components/app/workspace-context";
import { useSaveStatus } from "@/lib/save-status";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/research", label: "リサーチ" },
  { href: "/insights", label: "インサイト" },
  { href: "/actions", label: "アクション" },
];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { email } = useWorkspace();
  const status = useSaveStatus();
  const search = useCommandSearch();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-6">
        <Link href="/research" className="text-base font-semibold tracking-tight">
          silo
        </Link>
        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(t.href + "/");
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  active ? "bg-zinc-100 text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        {status !== "idle" && (
          <span className={cn("text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {status === "saving" ? "保存中…" : status === "saved" ? "保存済み" : "保存できませんでした"}
          </span>
        )}
        <Button variant="outline" size="sm" className="text-muted-foreground" onClick={search.open}>
          <SearchIcon data-icon="inline-start" />
          検索
          <kbd className="ml-2 rounded border bg-muted px-1 font-mono text-[10px]">⌘K</kbd>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{email.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="font-normal text-muted-foreground">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await createClient().auth.signOut();
                router.push("/login");
                router.refresh();
              }}
            >
              ログアウト
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommandSearch open={search.isOpen} onOpenChange={search.setOpen} />
    </header>
  );
}

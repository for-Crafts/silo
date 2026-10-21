"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback`, shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      toast.error("ログインリンクを送れませんでした。メールアドレスを確認してください");
      return;
    }
    setSent(true);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">silo</CardTitle>
        <CardDescription>メールアドレスでログイン</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sent ? (
          <p className="text-sm text-muted-foreground">
            届いたメールのリンクを開いてください（15 分で失効）。
          </p>
        ) : (
          <form onSubmit={sendLink} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@for-crafts.com"
              />
            </div>
            <Button type="submit" className="w-full bg-zinc-950" disabled={loading}>
              ログインリンクを送る
            </Button>
          </form>
        )}
        <Separator />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => toast("Google ログインは準備中です")}
        >
          Google でログイン
        </Button>
      </CardContent>
    </Card>
  );
}

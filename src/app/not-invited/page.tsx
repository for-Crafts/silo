import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/app/sign-out-button";

export default async function NotInvitedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: member } = await supabase.from("member").select("workspace_id").limit(1).maybeSingle();
  if (member) redirect("/research");

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>招待されていません</CardTitle>
          <CardDescription>
            {user.email} はこのワークスペースに招待されていません。管理者に招待を依頼してください。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutButton />
        </CardContent>
      </Card>
    </main>
  );
}

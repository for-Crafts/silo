import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}

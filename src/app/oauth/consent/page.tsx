import { Suspense } from "react";
import { ConsentForm } from "./consent-form";

export const metadata = { title: "Claude との接続 | silo" };

export default function ConsentPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
      <Suspense>
        <ConsentForm />
      </Suspense>
    </main>
  );
}

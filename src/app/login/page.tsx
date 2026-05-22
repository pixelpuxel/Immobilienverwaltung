import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect("/dashboard");
  return (
    <main className="grid min-h-screen place-items-center bg-panel px-5">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-4xl font-bold tracking-normal">Immobilienportal</h1>
          <p className="mt-2 text-muted">Einloggen und Immobilien, Unterlagen und Mietvertraege verwalten.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

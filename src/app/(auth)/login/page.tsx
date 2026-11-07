import { Suspense } from "react";
import { LoginForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Sign in" };

export default function Page() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Welcome back</h1>
      <Suspense><LoginForm /></Suspense>
    </>
  );
}

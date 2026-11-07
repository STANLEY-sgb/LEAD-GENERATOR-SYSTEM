import { RegisterForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Create account" };

export default function Page() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Create your account</h1>
      <RegisterForm />
    </>
  );
}

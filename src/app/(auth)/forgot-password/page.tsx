import { ForgotForm } from "@/components/auth/auth-forms";

export const metadata = { title: "Reset password" };

export default function Page() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Reset your password</h1>
      <ForgotForm />
    </>
  );
}

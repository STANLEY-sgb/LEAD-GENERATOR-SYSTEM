"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label, FieldError } from "@/components/ui/primitives";
import { loginSchema, registerSchema, forgotSchema } from "@/lib/validation";
import type { z } from "zod";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function LoginForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(v: z.infer<typeof loginSchema>) {
    setBusy(true);
    const { error } = await createClient().auth.signInWithPassword(v);
    setBusy(false);
    if (error) return void toast.error(error.message);
    router.replace(next);
    router.refresh();
  }

  async function google() {
    const { error } = await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) toast.error(error.message);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" {...register("email")} /><FieldError message={errors.email?.message} /></div>
      <div><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" {...register("password")} /><FieldError message={errors.password?.message} /></div>
      <div className="text-right text-sm"><Link href="/forgot-password" className="text-muted hover:underline">Forgot password?</Link></div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
      <p className="text-center text-sm text-muted">New here? <Link href="/register" className="font-semibold text-foreground hover:underline">Create an account</Link></p>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });

  async function onSubmit(v: z.infer<typeof registerSchema>) {
    setBusy(true);
    const { data, error } = await createClient().auth.signUp({
      email: v.email,
      password: v.password,
      options: { data: { full_name: v.fullName }, emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
    });
    setBusy(false);
    if (error) {
      const limited = error.status === 429 || /rate limit/i.test(error.message);
      return void toast.error(limited ? "Too many sign-up emails were sent recently. Please wait a while and try again, or contact support." : error.message);
    }
    if (data.user && data.user.identities?.length === 0) return void toast.error("An account with this email already exists. Try signing in.");
    if (data.session) { // e-mail confirmation disabled in Supabase: already signed in
      router.replace("/onboarding");
      router.refresh();
      return;
    }
    setSent(true);
  }

  if (sent) return <p role="status" className="rounded-lg bg-primary/15 p-4 text-sm">Check your inbox: we sent a verification link. Open it to finish creating your account.</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div><Label htmlFor="fullName">Full name</Label><Input id="fullName" autoComplete="name" {...register("fullName")} /><FieldError message={errors.fullName?.message} /></div>
      <div><Label htmlFor="email">Work email</Label><Input id="email" type="email" autoComplete="email" {...register("email")} /><FieldError message={errors.email?.message} /></div>
      <div><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="new-password" {...register("password")} /><FieldError message={errors.password?.message} /></div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
      <p className="text-center text-sm text-muted">Already registered? <Link href="/login" className="font-semibold text-foreground hover:underline">Sign in</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  async function onSubmit(v: z.infer<typeof forgotSchema>) {
    setBusy(true);
    await createClient().auth.resetPasswordForEmail(v.email, { redirectTo: `${location.origin}/auth/callback?next=/dashboard` });
    setBusy(false);
    setSent(true); // always show success: don't reveal whether the email exists
  }

  if (sent) return <p role="status" className="rounded-lg bg-primary/15 p-4 text-sm">If an account exists for that email, a reset link is on its way.</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div><Label htmlFor="email">Email</Label><Input id="email" type="email" {...register("email")} /><FieldError message={errors.email?.message} /></div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
    </form>
  );
}

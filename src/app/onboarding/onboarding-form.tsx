"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Label, FieldError } from "@/components/ui/primitives";
import { onboardingSchema, slugify } from "@/lib/validation";

export function OnboardingForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof onboardingSchema>>({ resolver: zodResolver(onboardingSchema) });

  async function onSubmit(v: z.infer<typeof onboardingSchema>) {
    setBusy(true);
    // Owner membership is created atomically inside the SECURITY DEFINER RPC; the client supplies no role or user id.
    const { error } = await createClient().rpc("create_organization", { p_name: v.name, p_slug: slugify(v.name) });
    setBusy(false);
    if (error) return void toast.error(error.message);
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div><Label htmlFor="name">Organization name</Label><Input id="name" {...register("name")} /><FieldError message={errors.name?.message} /></div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating…" : "Continue"}</Button>
    </form>
  );
}

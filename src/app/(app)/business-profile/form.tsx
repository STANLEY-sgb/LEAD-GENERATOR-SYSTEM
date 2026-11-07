"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { saveBusinessProfile } from "@/lib/actions/business";
import { Button, Card, Input, Label, Textarea } from "@/components/ui/primitives";

type Values = Parameters<typeof saveBusinessProfile>[0];

export function BusinessProfileForm({ initial, canEdit }: { initial: Values; canEdit: boolean }) {
  const { register, handleSubmit, formState: { isDirty }, reset } = useForm<Values>({ defaultValues: initial });
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = handleSubmit((v) =>
    start(async () => {
      const r = await saveBusinessProfile(v);
      if (r.ok) { toast.success("Business profile saved"); setError(null); reset(v); }
      else { setError(r.error); toast.error(r.error); }
    }),
  );

  const f = (id: keyof Values, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div><Label htmlFor={id}>{label}</Label><Input id={id} disabled={!canEdit} {...register(id)} {...props} /></div>
  );

  return (
    <form onSubmit={submit}>
      <Card className="space-y-4">
        {!canEdit && <p className="rounded-lg bg-accent/15 p-3 text-sm">Only owners and administrators can edit the business profile.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {f("name", "Organization name")}
          {f("industry", "Industry")}
          {f("businessEmail", "Business email", { type: "email" })}
          {f("phone", "Telephone", { type: "tel" })}
          {f("website", "Website", { placeholder: "https://" })}
          {f("location", "Business location")}
          {f("orgSize", "Organization size", { placeholder: "e.g. 11-50" })}
        </div>
        <div><Label htmlFor="description">What does your business do?</Label><Textarea id="description" rows={5} disabled={!canEdit} {...register("description")} /></div>
        <div><Label htmlFor="targetCountries">Target countries / regions <span className="text-muted">(comma separated)</span></Label><Textarea id="targetCountries" disabled={!canEdit} {...register("targetCountries")} /></div>
        <div><Label htmlFor="preferredSources">Preferred lead sources <span className="text-muted">(comma separated)</span></Label><Textarea id="preferredSources" disabled={!canEdit} {...register("preferredSources")} /></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {canEdit && <Button type="submit" disabled={pending || !isDirty}>{pending ? "Saving…" : "Save changes"}</Button>}
      </Card>
    </form>
  );
}

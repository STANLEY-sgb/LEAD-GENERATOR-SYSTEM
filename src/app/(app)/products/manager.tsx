"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Package, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteProduct, saveProduct } from "@/lib/actions/business";
import { Badge, Button, Card, Input, Label, Textarea } from "@/components/ui/primitives";

export type ProductRow = {
  id: string; name: string; description: string; category: string; priceMin: string; priceMax: string; targetAudience: string;
  benefits: string; geographicAvailability: string; keywords: string; searchPhrases: string; competitors: string;
};
const EMPTY: Omit<ProductRow, "id"> = { name: "", description: "", category: "", priceMin: "", priceMax: "", targetAudience: "", benefits: "", geographicAvailability: "", keywords: "", searchPhrases: "", competitors: "" };

function ProductForm({ initial, onDone }: { initial: ProductRow | null; onDone: () => void }) {
  const { register, handleSubmit } = useForm<Omit<ProductRow, "id">>({ defaultValues: initial ?? EMPTY });
  const [pending, start] = useTransition();
  const submit = handleSubmit((v) => start(async () => {
    const r = await saveProduct({ ...v, id: initial?.id });
    if (r.ok) { toast.success("Saved"); onDone(); } else toast.error(r.error);
  }));
  const text = (id: keyof Omit<ProductRow, "id">, label: string, hint?: string) => (
    <div><Label htmlFor={id}>{label}{hint && <span className="text-muted"> ({hint})</span>}</Label><Input id={id} {...register(id)} /></div>
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {text("name", "Name")}{text("category", "Category")}{text("priceMin", "Price from")}{text("priceMax", "Price to")}
      </div>
      <div><Label htmlFor="description">Description</Label><Textarea id="description" {...register("description")} /></div>
      {text("targetAudience", "Target audience")}
      <div className="grid gap-4 sm:grid-cols-2">
        {text("benefits", "Main benefits", "comma separated")}{text("geographicAvailability", "Available in", "comma separated")}
        {text("keywords", "Keywords", "comma separated")}{text("searchPhrases", "Related search phrases", "comma separated")}
        {text("competitors", "Competitor alternatives", "comma separated")}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

export function ProductsManager({ rows, canEdit }: { rows: ProductRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [pending, start] = useTransition();

  if (editing) {
    return <Card><ProductForm key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} /></Card>;
  }
  return (
    <div className="space-y-4">
      {canEdit && <Button onClick={() => setEditing("new")}><Plus size={16} /> Add product or service</Button>}
      {rows.length === 0 ? (
        <Card className="text-center">
          <Package className="mx-auto mb-2 text-muted" />
          <p className="font-semibold">No products or services yet</p>
          <p className="text-sm text-muted">Add what you sell so the AI knows which prospects are relevant.</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((p) => (
            <Card key={p.id} className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h2 className="truncate font-semibold">{p.name}</h2>{p.category && <Badge>{p.category}</Badge>}</div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                    <Button variant="ghost" aria-label={`Delete ${p.name}`} disabled={pending} onClick={() => {
                      if (!confirm(`Delete "${p.name}"?`)) return;
                      start(async () => { const r = await deleteProduct(p.id); { if (r.ok) toast.success("Deleted"); else toast.error(r.error); }; });
                    }}><Trash2 size={16} /></Button>
                  </div>
                )}
              </div>
              {p.description && <p className="line-clamp-3 text-sm text-muted">{p.description}</p>}
              {p.keywords && <p className="text-xs"><span className="font-semibold">Keywords:</span> {p.keywords}</p>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

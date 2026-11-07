import { getOrgContext } from "@/lib/org-context";
import { ProductsManager, type ProductRow } from "./manager";

export const metadata = { title: "Products & services" };

export default async function Page() {
  const { supabase, org, role } = await getOrgContext();
  const { data } = await supabase.from("products_services").select("*").eq("organization_id", org!.id).is("deleted_at", null).order("created_at", { ascending: false });
  const rows: ProductRow[] = (data ?? []).map((p) => ({
    id: p.id, name: p.name, description: p.description ?? "", category: p.category ?? "",
    priceMin: p.price_min?.toString() ?? "", priceMax: p.price_max?.toString() ?? "", targetAudience: p.target_audience ?? "",
    benefits: p.benefits.join(", "), geographicAvailability: p.geographic_availability.join(", "),
    keywords: p.keywords.join(", "), searchPhrases: p.search_phrases.join(", "), competitors: p.competitors.join(", "),
  }));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Products &amp; services</h1>
        <p className="text-sm text-muted">What you sell. Keywords and phrases drive lead discovery.</p>
      </div>
      <ProductsManager rows={rows} canEdit={["owner", "admin", "sales_manager"].includes(role ?? "")} />
    </div>
  );
}

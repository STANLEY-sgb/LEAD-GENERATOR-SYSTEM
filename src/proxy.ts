import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/", "/setup", "/api/health", "/api/public", "/api/worker", "/api/webhooks", "/f", "/unsubscribe", "/login", "/register", "/forgot-password", "/auth", "/pricing", "/features", "/about", "/contact", "/privacy", "/terms"];

function isPublic(path: string) {
  return PUBLIC_PREFIXES.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")));
}

// Optimistic session refresh + redirect. Real authorization is enforced by RLS and server-side membership checks.
export async function proxy(request: NextRequest) {
  // Without Supabase config nothing can authenticate; show setup guidance instead of crashing.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    const p = request.nextUrl.pathname;
    const passthrough = ["/", "/setup", "/features", "/pricing", "/about", "/contact", "/privacy", "/terms"];
    if (passthrough.includes(p) || p.startsWith("/api/")) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  if (!data?.claims && !isPublic(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

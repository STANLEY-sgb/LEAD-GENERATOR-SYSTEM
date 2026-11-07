"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changeMemberRole, inviteMember, removeMember, revokeInvitation } from "@/lib/actions/crm";
import { Badge, Button, Card, Input, Label } from "@/components/ui/primitives";

type M = { id: string; user_id: string; role: string; name: string; email: string | null };
type I = { id: string; email: string; role: string; expires_at: string };
const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Administrator", sales_manager: "Sales manager", sales_rep: "Sales representative", analyst: "Analyst (read-only)" };

export function TeamManager({ members, invites, me, myRole, canManage }: { members: M[]; invites: I[]; me: string; myRole: string; canManage: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales_rep");
  const [link, setLink] = useState<string | null>(null);
  const roles = ["sales_rep", "sales_manager", "analyst", ...(myRole === "owner" ? ["admin"] : [])];

  return (
    <div className="space-y-6">
      {canManage && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Invite a teammate</h2>
          <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await inviteMember(email, role); if (r.ok) { setLink(r.data!.link); setEmail(""); toast.success(r.data!.emailed ? "Invitation e-mailed" : "Invitation created. Share the link below"); router.refresh(); } else toast.error(r.error); }); }}>
            <div className="min-w-0 flex-1 basis-56"><Label htmlFor="inv-email">Email</Label><Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label htmlFor="inv-role">Role</Label><select id="inv-role" className="min-h-10 rounded-lg border border-border bg-card px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
            <Button type="submit" disabled={pending}>Send invite</Button>
          </form>
          {link && <p className="break-all rounded-lg bg-black/5 p-2 text-sm dark:bg-white/5">Invitation link (valid 7 days, only works for that e-mail address): <b>{link}</b></p>}
          {invites.length > 0 && <ul className="space-y-1 text-sm">{invites.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><span>{i.email} <Badge>{ROLE_LABEL[i.role]}</Badge> <span className="text-muted">pending</span></span><Button variant="ghost" onClick={() => start(async () => { const r = await revokeInvitation(i.id); if (r.ok) router.refresh(); else toast.error(r.error); })}>Revoke</Button></li>)}</ul>}
        </Card>
      )}
      <Card className="divide-y divide-border p-0">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0"><p className="truncate font-medium">{m.name}{m.user_id === me && <span className="text-muted"> (you)</span>}</p><p className="truncate text-xs text-muted">{m.email}</p></div>
            <div className="flex items-center gap-2">
              {canManage && m.role !== "owner" && m.user_id !== me && !(m.role === "admin" && myRole !== "owner") ? (
                <>
                  <select aria-label={`Role for ${m.name}`} className="min-h-9 rounded-lg border border-border bg-card px-2 text-sm" value={m.role} disabled={pending} onChange={(e) => start(async () => { const r = await changeMemberRole(m.id, e.target.value); if (r.ok) { toast.success("Role updated"); router.refresh(); } else toast.error(r.error); })}>
                    {["admin", "sales_manager", "sales_rep", "analyst"].filter((r) => r !== "admin" || myRole === "owner" || m.role === "admin").map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                  <Button variant="ghost" onClick={() => { if (confirm(`Remove ${m.name}?`)) start(async () => { const r = await removeMember(m.id); if (r.ok) router.refresh(); else toast.error(r.error); }); }}>Remove</Button>
                </>
              ) : <Badge>{ROLE_LABEL[m.role]}</Badge>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

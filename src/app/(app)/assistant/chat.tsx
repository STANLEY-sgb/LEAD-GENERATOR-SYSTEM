"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { askAssistant } from "@/lib/actions/assistant";
import { Button, Card, Textarea } from "@/components/ui/primitives";

type Msg = { id: string; role: "user" | "assistant"; content: string };
const SUGGESTIONS = ["Which leads are most likely to buy?", "Summarize my best opportunities", "Show me my newest leads", "Draft a follow-up email for my top lead", "How can I improve my targeting?", "Analyze my pipeline"];

export function Chat({ initial, enabled }: { initial: Msg[]; enabled: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, pending]);

  function send(q: string) {
    if (!q.trim() || pending) return;
    setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "user", content: q }]); setText("");
    start(async () => {
      const r = await askAssistant(q);
      if (r.ok && r.data) setMsgs((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: r.data!.reply }]);
      else toast.error(r.ok ? "No reply" : r.error);
    });
  }

  return (
    <>
      {!enabled && <p className="rounded-lg bg-accent/15 p-3 text-sm">The assistant isn&apos;t configured on this deployment yet. Set <code>OPENAI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code>.</p>}
      <Card className="flex h-[60dvh] flex-col gap-3 overflow-y-auto" aria-live="polite">
        {msgs.length === 0 && <div className="m-auto text-center text-sm text-muted"><p className="mb-3">Try asking:</p><div className="flex flex-wrap justify-center gap-2">{SUGGESTIONS.map((s) => <button key={s} disabled={!enabled} onClick={() => send(s)} className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/5">{s}</button>)}</div></div>}
        {msgs.map((m) => <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-navy px-3 py-2 text-sm text-white" : "mr-auto max-w-[90%] whitespace-pre-wrap rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/5"}>{m.content}</div>)}
        {pending && <div className="mr-auto rounded-xl bg-black/5 px-3 py-2 text-sm text-muted dark:bg-white/5">Thinking…</div>}
        <div ref={end} />
      </Card>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <Textarea aria-label="Message" rows={2} value={text} disabled={!enabled} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} placeholder="Ask about your leads, pipeline or outreach…" />
        <Button type="submit" disabled={pending || !enabled || !text.trim()}>Send</Button>
      </form>
    </>
  );
}

"use client";

// F22 "Explain My Decision" — conversational query surface over the Trust Ledger.
// Answers come from the backend, which retrieves the actual logged records and
// explains the reasoning from that evidence — never invented client-side.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/services/api";
import type { Session } from "@/schemas/pipeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Turn = { role: "user" | "verya"; text: string; recordsUsed?: number };

export function ExplainPanel({ session }: { session?: Session | null }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");

  const ask = useMutation({
    mutationFn: (q: string) =>
      api.explain({
        question: q,
        sessionId: session?.id,
      }),
    onSuccess: (data) => {
      setTurns((prev) => [...prev, { role: "verya", text: data.answer, recordsUsed: data.recordsUsed }]);
    },
    onError: (err) => {
      setTurns((prev) => [
        ...prev,
        { role: "verya", text: err instanceof Error ? err.message : "Something went wrong. Try again." },
      ]);
    },
  });

  const submit = () => {
    const q = question.trim();
    if (q.length < 3 || ask.isPending) return;
    setTurns((prev) => [...prev, { role: "user", text: q }]);
    ask.mutate(q);
    setQuestion("");
  };

  return (
    <div className="rounded-xl border border-line bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold">Explain My Decision</h3>
        <span className="text-[11px] text-muted">grounded in the Trust Ledger</span>
      </div>
      <p className="mt-1 text-[12px] text-muted">
        Ask why the system picked a model, algorithm, or stack. Answers cite actual ledger records.
      </p>

      {turns.length === 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[
            "Why was the last model chosen?",
            "Which flaws did humans reject?",
            "What did execution cost so far?",
          ].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTurns((prev) => [...prev, { role: "user", text: s }]);
                ask.mutate(s);
              }}
              className="rounded-full border border-line px-3 py-1 text-[12px] text-muted hover:border-fg hover:text-fg"
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {turns.map((t, i) => (
            <li
              key={i}
              className={`rounded-lg px-3 py-2 text-[13px] ${
                t.role === "user" ? "bg-elev text-fg" : "border border-line bg-card"
              }`}
            >
              <span className="mr-1.5 font-semibold">{t.role === "user" ? "You" : "Verya"}:</span>
              {t.text}
              {t.recordsUsed !== undefined && (
                <span className="ml-1 text-[11px] text-muted">({t.recordsUsed} ledger records)</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Why was this model chosen for X?"
          disabled={ask.isPending}
          className="h-9 flex-1 rounded border border-line bg-elev text-[13px]"
        />
        <Button size="sm" disabled={ask.isPending || question.trim().length < 3} onClick={submit}>
          {ask.isPending ? "…" : "Ask"}
        </Button>
      </div>
      {ask.isPending && <p className="pulse-soft mt-2 text-[12px] text-muted">Reading the ledger…</p>}
    </div>
  );
}

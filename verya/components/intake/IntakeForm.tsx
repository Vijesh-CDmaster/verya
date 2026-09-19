"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { IntakeFormSchema, type IntakeFormValues } from "@/schemas/pipeline";
import { useStartPipeline, useUploadPipeline } from "@/hooks/use-session";
import { useUiStore } from "@/stores/ui-store";
import { Button } from "@/components/ui/button";
import { Textarea, Input, Label, Select } from "@/components/ui/input";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import type { Session } from "@/schemas/pipeline";

const EXAMPLES = [
  "Build an e-commerce platform with authentication, product search, payments and order tracking.",
  "A team wiki with real-time collaborative editing, version history, and per-workspace permissions. Around 500 users at launch.",
  "Internal tool: ingest CSV uploads up to 50MB, validate rows against business rules, show failures, and export corrected files.",
];

export function IntakeForm({ onStarted }: { onStarted?: (session: Session) => void }) {
  const store = useUiStore();
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const start = useStartPipeline();
  const upload = useUploadPipeline();

  const form = useForm<IntakeFormValues>({
    resolver: zodResolver(IntakeFormSchema),
    defaultValues: {
      input: store.draftInput,
      hasStack: store.hasStack,
      statedStack: store.statedStack,
      policy: store.policy,
    },
  });

  const input = form.watch("input");
  const hasStack = form.watch("hasStack");

  useEffect(() => {
    store.setDraftInput(input ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  useEffect(() => {
    store.setHasStack(Boolean(hasStack));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStack]);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      // F1.3: PDF/DOCX/RTF go through the server-side extraction endpoint; text
      // formats are read client-side and combined with the description as before.
      const binary = files.find((f) => /\.(pdf|docx?|rtf)$/i.test(f.name));
      if (binary) {
        if (files.length > 1) {
          setError("Upload one document at a time for PDF/DOCX files.");
          return;
        }
        const res = await upload.mutateAsync({
          file: binary,
          description: values.input,
          statedStack: values.hasStack ? values.statedStack : "",
        });
        store.setStatedStack(values.hasStack ? values.statedStack : "");
        onStarted?.(res.session as Session);
        return;
      }

      let combined = values.input;
      for (const f of files) {
        const text = await f.text();
        combined += `\n\n--- ATTACHED FILE: ${f.name} ---\n${text.slice(0, 100000)}`;
      }
      const res = await start.mutateAsync({
        input: combined,
        statedStack: values.hasStack ? values.statedStack : "",
        policy: values.policy,
      });
      store.setStatedStack(values.hasStack ? values.statedStack : "");
      store.setPolicy(values.policy);
      onStarted?.(res.session as Session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start analysis");
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <Label htmlFor="project-input">Your project</Label>
        <Textarea
          id="project-input"
          rows={6}
          placeholder="Describe your project and the workflow you have in mind. No structure needed — brain-dump is fine."
          className="mt-1.5 resize-y"
          {...form.register("input")}
        />
        {form.formState.errors.input && (
          <p className="mt-1 text-xs text-red-400">{form.formState.errors.input.message}</p>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[var(--primary)]"
          {...form.register("hasStack")}
        />
        I already have a stack — validate it, don&apos;t pick one
      </label>

      {hasStack && (
        <div className="fade-up">
          <Label htmlFor="stated-stack">Your stack</Label>
          <Input
            id="stated-stack"
            placeholder="e.g. Next.js, Postgres, Prisma, Tailwind, Vercel"
            className="mt-1.5"
            {...form.register("statedStack")}
          />
        </div>
      )}

      <div>
        <Label htmlFor="policy">Routing policy (how the model gate decides)</Label>
        <Select id="policy" className="mt-1.5" {...form.register("policy")}>
          <option value="balanced">Balanced cost vs risk (default)</option>
          <option value="lowest_cost">Lowest cost</option>
          <option value="highest_accuracy">Highest accuracy</option>
          <option value="org_approved">Organization-approved models only</option>
        </Select>
      </div>

      <div>
        <Label htmlFor="files">Attach a plan or spec (PDF, DOCX, TXT, MD, CSV, JSON, YAML · max 10MB)</Label>
        <Input
          id="files"
          ref={fileRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.rtf,.txt,.md,.csv,.json,.yaml,.yml,.log"
          className="mt-1.5 cursor-pointer file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-elev file:px-3 file:py-1.5 file:text-sm"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 5))}
        />
        {files.length > 0 && (
          <p className="mt-1 text-xs text-muted">{files.map((f) => f.name).join(", ")}</p>
        )}
      </div>

      {error && (
        <Alert variant="error">
          <AlertTitle>Could not start</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted">Enter to start · Shift+Enter for a new line</span>
        <Button type="submit" disabled={start.isPending || upload.isPending || (input ?? "").trim().length < 20}>
          {start.isPending || upload.isPending ? "Analyzing…" : "Analyze my project →"}
        </Button>
      </div>

      <div className="border-t border-line pt-4">
        <p className="mb-2 text-[11px] uppercase tracking-[0.08em] text-muted">Or start from an example</p>
        <div className="flex flex-col gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => form.setValue("input", ex)}
              className="rounded-lg border border-line bg-card px-3 py-2 text-left text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>
    </form>
  );
}

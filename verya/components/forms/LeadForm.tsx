"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LeadSchema, type LeadInput } from "@/schemas/lead";
import { api } from "@/services/api";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function LeadForm() {
  const [status, setStatus] = useState<"idle" | "success" | "error" | "sending">("idle");
  const [message, setMessage] = useState<string>("");

  const form = useForm<LeadInput>({
    resolver: zodResolver(LeadSchema),
    defaultValues: { name: "", email: "", phone: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    setStatus("sending");
    setMessage("");
    try {
      const res = await api.createLead(values);
      setStatus("success");
      setMessage(res.message ?? "✓ Thank you! We'll be in touch soon.");
      form.reset();
      window.setTimeout(() => setStatus("idle"), 4000);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  });

  return (
    <div className="mx-auto max-w-md rounded-xl bg-surface p-10">
      <h3 className="mb-6 text-center text-2xl font-bold">Get Started with Verya</h3>
      <form onSubmit={submit} noValidate>
        <div className="mb-5">
          <Label htmlFor="lead-name" variant="form">
            Full Name
          </Label>
          <Input
            id="lead-name"
            type="text"
            placeholder="John Doe"
            className="bg-bg"
            {...form.register("name")}
          />
          {form.formState.errors.name && (
            <p className="mt-1 text-xs text-danger">{form.formState.errors.name.message}</p>
          )}
        </div>
        <div className="mb-5">
          <Label htmlFor="lead-email" variant="form">
            Email Address
          </Label>
          <Input
            id="lead-email"
            type="email"
            placeholder="you@company.com"
            className="bg-bg"
            {...form.register("email")}
          />
          {form.formState.errors.email && (
            <p className="mt-1 text-xs text-danger">{form.formState.errors.email.message}</p>
          )}
        </div>
        <div className="mb-5">
          <Label htmlFor="lead-phone" variant="form">
            Phone Number
          </Label>
          <Input
            id="lead-phone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            className="bg-bg"
            {...form.register("phone")}
          />
        </div>
        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full rounded-md bg-accent py-3 font-semibold text-accent-fg transition-all hover:opacity-90 disabled:opacity-50"
        >
          {status === "sending" ? "Sending…" : "Get Started"}
        </button>
        <div
          aria-live="polite"
          className={cn(
            "mt-3 rounded-md p-3 text-center text-[13px]",
            status === "success" && "bg-success/15 text-success",
            status === "error" && "bg-danger/15 text-danger"
          )}
        >
          {message}
        </div>
      </form>
    </div>
  );
}

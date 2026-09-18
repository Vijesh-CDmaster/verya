"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type MemoryResult = {
  id: number;
  title: string;
  content: string;
  model: string;
  taskCategory: string;
  outcome: string;
  similarity?: number;
};

export function MemorySearchCard() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const { data, isFetching, isError } = useQuery({
    queryKey: ["memory-search", submitted],
    queryFn: () => api.memorySearch(submitted),
    enabled: submitted.trim().length >= 3,
    staleTime: 30_000,
    retry: false,
  });

  const results = (data?.results ?? []) as MemoryResult[];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Org memory search (pgvector)</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(query);
          }}
          className="mb-4"
        >
          <Label htmlFor="memory-q" className="mb-1.5 block">
            Semantically search past decisions (embeddings via cosine similarity)
          </Label>
          <div className="flex gap-2">
            <Input
              id="memory-q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. how did auth token handling go before?"
              className="bg-bg"
            />
            <button
              type="submit"
              disabled={isFetching || query.trim().length < 3}
              className="rounded-lg bg-accent px-4 text-sm text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isFetching ? "…" : "Search"}
            </button>
          </div>
        </form>

        {submitted.trim().length >= 3 && results.length === 0 && !isFetching && !isError && (
          <p className="text-sm text-muted">
            No similar memories yet — outcomes are remembered as you give feedback on executions.
          </p>
        )}
        {isError && (
          <p className="text-sm text-muted">
            Memory search is unavailable (vector index unreachable or database not connected).
          </p>
        )}
        {results.length > 0 && (
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.id} className="rounded-lg border border-line bg-elev p-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{r.title}</span>
                  <Badge variant="muted">{r.taskCategory}</Badge>
                  <Badge variant={r.outcome === "accepted" ? "success" : r.outcome === "rejected" ? "danger" : "muted"}>
                    {r.outcome}
                  </Badge>
                  <span className="font-mono text-[11px] text-muted">{r.model}</span>
                  {typeof r.similarity === "number" && (
                    <span className="ml-auto font-mono text-[11px] text-muted">
                      {Math.round(r.similarity * 100)}% match
                    </span>
                  )}
                </div>
                <p className="line-clamp-2 text-xs text-muted">{r.content}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

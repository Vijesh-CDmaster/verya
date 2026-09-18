"use client";

// TanStack Query hooks — all server state flows through these.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/services/api";
import { useUiStore } from "@/stores/ui-store";

export function useSession(sessionId: string | null) {
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getPipeline(sessionId!),
    enabled: Boolean(sessionId),
    refetchInterval: (query) => {
      const session = (query.state.data as { session?: { gateStatus?: string } } | undefined)?.session;
      return session?.gateStatus === "running" ? 2500 : false;
    },
    retry: (count, err) => (err instanceof ApiError && err.status < 500 ? false : count < 2),
  });
}

export function useStartPipeline() {
  const qc = useQueryClient();
  const setSessionId = useUiStore((s) => s.setSessionId);
  return useMutation({
    mutationFn: (payload: { input: string; statedStack: string; policy: string }) =>
      api.startPipeline(payload),
    onSuccess: (data) => {
      const session = data.session as { id?: string } | undefined;
      if (session?.id) setSessionId(session.id);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

/** F1.3: document upload intake (server-side PDF/DOCX/text extraction). */
export function useUploadPipeline() {
  const qc = useQueryClient();
  const setSessionId = useUiStore((s) => s.setSessionId);
  return useMutation({
    mutationFn: (payload: { file: File; description?: string; statedStack?: string }) =>
      api.uploadPipeline(payload.file, { description: payload.description, statedStack: payload.statedStack }),
    onSuccess: (data) => {
      const session = data.session as { id?: string } | undefined;
      if (session?.id) setSessionId(session.id);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useGateAction(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: unknown) => {
      if (!sessionId) throw new ApiError("No active session", 400);
      return api.act(sessionId, action);
    },
    onSuccess: (data) => {
      qc.setQueryData(["session", sessionId], data);
    },
  });
}

export function useExecute(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!sessionId) throw new ApiError("No active session", 400);
      return api.execute(sessionId);
    },
    onSuccess: (data) => {
      qc.setQueryData(["session", sessionId], data);
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.dashboard(),
    refetchInterval: 15_000,
  });
}

export function useBackendHealth() {
  return useQuery({
    queryKey: ["backend-health"],
    queryFn: () => api.health(),
    refetchInterval: 30_000,
    retry: false,
  });
}

/** Model reputation leaderboard (F12/F22 trust badges). */
export function useReputation() {
  return useQuery({
    queryKey: ["reputation"],
    queryFn: () => api.reputation(),
    staleTime: 30_000,
    retry: (count, err) => (err instanceof ApiError && err.status < 500 ? false : count < 2),
  });
}

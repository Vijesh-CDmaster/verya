import { createHash } from "node:crypto";
import type { ExecutionResult, ModelId, PipelineSession } from "../schemas/pipeline";

export type TrustCertificate = {
  version: 1;
  sessionId: string;
  taskId: string;
  model: ModelId;
  outputHash: string;
  verification: ExecutionResult["verification"];
  confidence: number;
  status: ExecutionResult["status"];
  humanApproved: boolean;
  issuedAt: string;
  certificateHash: string;
};

export function certificateFor(session: PipelineSession, execution: ExecutionResult): TrustCertificate {
  const issuedAt = new Date().toISOString();
  const outputHash = createHash("sha256").update(execution.output).digest("hex");
  const unsigned = {
    version: 1 as const,
    sessionId: session.id,
    taskId: execution.taskId,
    model: execution.model,
    outputHash,
    verification: execution.verification,
    confidence: execution.confidence,
    status: execution.status,
    humanApproved: execution.humanRating != null,
    issuedAt,
  };
  const certificateHash = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  return { ...unsigned, certificateHash };
}

export function verifyCertificate(certificate: TrustCertificate): boolean {
  const { certificateHash, ...unsigned } = certificate;
  const expected = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  return expected === certificateHash;
}

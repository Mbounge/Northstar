// Northstar in-memory artboard version control — canonical objects and content-addressed commits.
import type {
  CanvasCodeArtifactContentSize,
  CanvasCodeArtifactIntrinsicBounds,
  CanvasCodeArtifactPayload,
  CanvasCodeArtifactRuntimeReview,
  NorthstarArtboardCommit,
  NorthstarCommittedGeometry,
  NorthstarLiveSurfaceSnapshot,
  NorthstarPreparedArtboardTree,
  NorthstarRepositoryProposal,
  NorthstarWebArtifactDocument,
} from "./types";

const HASH_VERSION = "ns-git-v1";

function canonicalValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.replaceAll("\r\n", "\n");
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalValue(child)]),
    );
  }
  return String(value);
}

export function canonicalNorthstarJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

/**
 * Portable synchronous SHA-256 content address.
 *
 * This deliberately avoids Node-only crypto APIs so the browser repository and
 * server tests calculate exactly the same identity. The format/version prefix
 * prevents future canonicalization changes from aliasing v1 commits.
 */
const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256Hex(value: string): string {
  const encoded = new TextEncoder().encode(value);
  const bitLength = encoded.length * 8;
  const paddedLength = Math.ceil((encoded.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(encoded);
  bytes[encoded.length] = 0x80;

  const lengthView = new DataView(bytes.buffer);
  const highBits = Math.floor(bitLength / 0x1_0000_0000);
  const lowBits = bitLength >>> 0;
  lengthView.setUint32(paddedLength - 8, highBits, false);
  lengthView.setUint32(paddedLength - 4, lowBits, false);

  const state: number[] = [...SHA256_INITIAL];
  const schedule = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = lengthView.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const x = schedule[index - 15];
      const y = schedule[index - 2];
      const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + SHA256_ROUND_CONSTANTS[index] + schedule[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  return state.map((part) => part.toString(16).padStart(8, "0")).join("");
}

export function hashNorthstarContent(value: unknown): string {
  const canonical = typeof value === "string"
    ? value.replaceAll("\r\n", "\n")
    : canonicalNorthstarJson(value);
  return `ns1-${sha256Hex(`${HASH_VERSION}\0${canonical}`)}`;
}

function finite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function normalizeNorthstarBounds(
  source: CanvasCodeArtifactIntrinsicBounds | undefined,
  fallbackWidth: number,
  fallbackHeight: number,
): CanvasCodeArtifactIntrinsicBounds {
  const minX = Math.floor(finite(source?.minX, 0));
  const minY = Math.floor(finite(source?.minY, 0));
  const maxX = Math.ceil(Math.max(minX + 1, finite(source?.maxX, minX + Math.max(1, fallbackWidth))));
  const maxY = Math.ceil(Math.max(minY + 1, finite(source?.maxY, minY + Math.max(1, fallbackHeight))));
  return { minX, minY, maxX, maxY };
}

export function committedGeometryFromSize(input: {
  size?: CanvasCodeArtifactContentSize;
  minimumWidth: number;
  minimumHeight: number;
  fallbackWidth: number;
  fallbackHeight: number;
}): NorthstarCommittedGeometry {
  const contentBounds = normalizeNorthstarBounds(
    input.size?.contentBounds,
    input.size?.intrinsicWidth ?? input.fallbackWidth,
    input.size?.intrinsicHeight ?? input.fallbackHeight,
  );
  const contentWidth = Math.max(1, contentBounds.maxX - contentBounds.minX);
  const contentHeight = Math.max(1, contentBounds.maxY - contentBounds.minY);
  return {
    intrinsicWidth: Math.ceil(Math.max(contentWidth, finite(input.size?.intrinsicWidth, contentWidth))),
    intrinsicHeight: Math.ceil(Math.max(contentHeight, finite(input.size?.intrinsicHeight, contentHeight))),
    contentBounds,
    viewportFloor: {
      width: Math.max(1, Math.ceil(input.minimumWidth)),
      height: Math.max(1, Math.ceil(input.minimumHeight)),
    },
  };
}

export function documentFromLiveSnapshot(
  snapshot: NorthstarLiveSurfaceSnapshot | undefined,
  fallback: NorthstarWebArtifactDocument,
): NorthstarWebArtifactDocument {
  if (!snapshot) return fallback;
  return {
    schema: "northstar.web-artifact-document.v1",
    html: snapshot.html,
    css: snapshot.css,
    javascript: "",
  };
}


function normalizeRuntimeReview(
  review: CanvasCodeArtifactRuntimeReview | undefined,
): CanvasCodeArtifactRuntimeReview | undefined {
  if (!review) return undefined;
  return {
    ...review,
    revisionId: "content-addressed",
    mutationId: undefined,
    evaluatedAt: "content-addressed",
  };
}

function commitHashes(input: {
  document: NorthstarWebArtifactDocument;
  semanticNodes: NorthstarLiveSurfaceSnapshot["semanticNodes"];
  geometry: NorthstarCommittedGeometry;
  runtimeReview?: CanvasCodeArtifactRuntimeReview;
}) {
  const documentHash = hashNorthstarContent(input.document);
  const semanticHash = hashNorthstarContent(input.semanticNodes ?? []);
  const geometryHash = hashNorthstarContent(input.geometry);
  const runtimeReviewHash = hashNorthstarContent(normalizeRuntimeReview(input.runtimeReview) ?? null);
  const treeHash = hashNorthstarContent({
    documentHash,
    semanticHash,
    geometryHash,
    runtimeReviewHash,
  });
  return { documentHash, semanticHash, geometryHash, runtimeReviewHash, treeHash };
}

export function createNorthstarRootCommit(input: {
  artifact: CanvasCodeArtifactPayload;
  snapshot?: NorthstarLiveSurfaceSnapshot;
  size?: CanvasCodeArtifactContentSize;
  review?: CanvasCodeArtifactRuntimeReview;
}): NorthstarArtboardCommit {
  const document = documentFromLiveSnapshot(input.snapshot, input.artifact.document ?? {
    schema: "northstar.web-artifact-document.v1",
    html: "",
    css: "",
    javascript: "",
  });
  const geometry = committedGeometryFromSize({
    size: input.size,
    minimumWidth: input.artifact.minimumWidth,
    minimumHeight: input.artifact.minimumHeight,
    fallbackWidth: input.artifact.preferredWidth,
    fallbackHeight: input.artifact.preferredHeight,
  });
  const runtimeReview = normalizeRuntimeReview(input.review);
  const hashes = commitHashes({
    document,
    semanticNodes: input.snapshot?.semanticNodes,
    geometry,
    runtimeReview,
  });
  const revisionId = input.artifact.revisionId;
  const commitHash = hashNorthstarContent({
    parentCommitHash: null,
    treeHash: hashes.treeHash,
    commitSequence: 0,
    mutationId: null,
    revisionId,
  });
  return {
    schema: "northstar.artboard-commit.v1",
    artifactId: input.artifact.artifactId,
    surfaceId: input.artifact.surfaceId ?? input.artifact.artifactId,
    commitHash,
    parentCommitHash: null,
    commitSequence: 0,
    revisionId,
    proposalId: null,
    mutationId: null,
    tree: {
      document,
      semanticNodes: input.snapshot?.semanticNodes ?? [],
      geometry,
      runtimeReview,
    },
    hashes,
  };
}

export function createNorthstarPreparedTree(input: {
  artifactId: string;
  surfaceId: string;
  proposal: NorthstarRepositoryProposal;
  snapshot: NorthstarLiveSurfaceSnapshot;
  size: CanvasCodeArtifactContentSize;
  review?: CanvasCodeArtifactRuntimeReview;
  minimumWidth: number;
  minimumHeight: number;
  fallbackDocument: NorthstarWebArtifactDocument;
}): NorthstarPreparedArtboardTree {
  const document = documentFromLiveSnapshot(input.snapshot, input.fallbackDocument);
  const geometry = committedGeometryFromSize({
    size: input.size,
    minimumWidth: input.minimumWidth,
    minimumHeight: input.minimumHeight,
    fallbackWidth: input.size.intrinsicWidth,
    fallbackHeight: input.size.intrinsicHeight,
  });
  const runtimeReview = normalizeRuntimeReview(input.review);
  const hashes = commitHashes({
    document,
    semanticNodes: input.snapshot.semanticNodes,
    geometry,
    runtimeReview,
  });
  return {
    schema: "northstar.prepared-artboard-tree.v1",
    artifactId: input.artifactId,
    surfaceId: input.surfaceId,
    transactionId: input.proposal.transactionId,
    proposalId: input.proposal.proposalId,
    baseCommitHash: input.proposal.baseCommitHash,
    revisionId: input.proposal.revisionId,
    mutationId: input.proposal.mutation.mutationId,
    document,
    semanticNodes: input.snapshot.semanticNodes ?? [],
    geometry,
    runtimeReview,
    hashes,
  };
}

export function createNorthstarCandidateCommit(input: {
  parent: NorthstarArtboardCommit;
  proposal: NorthstarRepositoryProposal;
  prepared: NorthstarPreparedArtboardTree;
}): NorthstarArtboardCommit {
  if (input.proposal.baseCommitHash !== input.parent.commitHash) {
    throw new Error("Candidate proposal is not based on repository HEAD.");
  }
  if (input.prepared.baseCommitHash !== input.parent.commitHash) {
    throw new Error("Prepared browser tree is not based on repository HEAD.");
  }
  if (input.prepared.transactionId !== input.proposal.transactionId) {
    throw new Error("Prepared browser tree belongs to another transaction.");
  }
  const commitSequence = input.parent.commitSequence + 1;
  const commitHash = hashNorthstarContent({
    parentCommitHash: input.parent.commitHash,
    treeHash: input.prepared.hashes.treeHash,
    commitSequence,
    mutationId: input.proposal.mutation.mutationId,
    revisionId: input.proposal.revisionId,
  });
  return {
    schema: "northstar.artboard-commit.v1",
    artifactId: input.parent.artifactId,
    surfaceId: input.parent.surfaceId,
    commitHash,
    parentCommitHash: input.parent.commitHash,
    commitSequence,
    revisionId: input.proposal.revisionId,
    proposalId: input.proposal.proposalId,
    mutationId: input.proposal.mutation.mutationId,
    tree: {
      document: input.prepared.document,
      semanticNodes: input.prepared.semanticNodes,
      geometry: input.prepared.geometry,
      runtimeReview: input.prepared.runtimeReview,
    },
    hashes: input.prepared.hashes,
  };
}

export function verifyNorthstarCommit(commit: NorthstarArtboardCommit): boolean {
  const hashes = commitHashes({
    document: commit.tree.document,
    semanticNodes: commit.tree.semanticNodes,
    geometry: commit.tree.geometry,
    runtimeReview: commit.tree.runtimeReview,
  });
  if (canonicalNorthstarJson(hashes) !== canonicalNorthstarJson(commit.hashes)) return false;
  const expected = hashNorthstarContent({
    parentCommitHash: commit.parentCommitHash,
    treeHash: hashes.treeHash,
    commitSequence: commit.commitSequence,
    mutationId: commit.mutationId,
    revisionId: commit.revisionId,
  });
  return expected === commit.commitHash;
}
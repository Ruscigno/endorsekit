// Data-access seam for the endorsement registry.
//
// The expiry engine is a pure function over `students` + issued
// `endorsements`; this interface is the only thing that knows where those
// rows come from. V1 ships an in-memory seed adapter (see ./seed.ts) so the
// registry screen renders a real vertical slice before the append-only
// `endorsements` / `students` tables (product-research §4.2) land behind the
// Go backend. The append-only registry is the legal-record heart of the
// product (ADR-0002), so this seam is intentionally READ-ONLY here —
// issuance (the write path) goes through the Go backend that seals and
// hash-chains each row, never through the web tier. Swapping in a real
// adapter later is a one-file change with no churn in the engine or route.

import type { IssuedEndorsement, Student } from "$lib/endorsements/types";

// Each repository instance is already scoped to ONE owning CFI (the seed
// adapter to its demo roster; the Postgres adapter to the `ownerCfiId` passed
// to its factory). The owner is therefore NOT a per-call argument — passing it
// per call would be a false contract that the adapters silently ignore.
export interface EndorsementRepository {
  /** The CFI's roster (the per-student rollup targets). */
  listStudents(): Promise<Student[]>;
  /** The endorsements the CFI has issued (the append-only registry rows). */
  listEndorsements(): Promise<IssuedEndorsement[]>;
}

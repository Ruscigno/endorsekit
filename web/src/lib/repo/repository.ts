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

export interface EndorsementRepository {
  /** The CFI's roster (the per-student rollup targets). */
  listStudents(ownerCfiId: string): Promise<Student[]>;
  /** The endorsements the CFI has issued (the append-only registry rows). */
  listEndorsements(ownerCfiId: string): Promise<IssuedEndorsement[]>;
}

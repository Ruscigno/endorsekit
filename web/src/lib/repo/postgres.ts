// Postgres-backed EndorsementRepository — the real read-side persistence
// adapter behind the repository seam. Connects to the shared Cortex Postgres
// with the gear's `endorsekit_app` role (DATABASE_URL) and reads the gear's
// `endorsekit` schema, scoping every query by the authenticated Cortex user id
// (the owning CFI). Mirrors the Go backend's per-request owner predicate
// (product-research §4.3 / CLAUDE.md).
//
// Read-only by design: the append-only registry is the legal-record heart of
// the product (ADR-0002), so issuance — the sealed, hash-chained WRITE path —
// goes through the Go backend, never through the web tier. This adapter only
// lists students + issued endorsements for the expiry engine.
//
// Server-only: imported from +page.server.ts via the repository factory, never
// from a .svelte component, so the browser never holds the connection string.
// The row→domain mappers are pure and exported so they can be unit-tested
// without a live database (the CI `web` lane has no Postgres; the `db` lane
// round-trips the migration separately).

import postgres from "postgres";
import { env } from "$env/dynamic/private";
import {
  isValidityRule,
  type IssuedEndorsement,
  type Student,
} from "$lib/endorsements/types";
import type { EndorsementRepository } from "./repository";

/** Shape of an `endorsekit.student` row as selected below. */
export interface StudentRow {
  id: string;
  name: string;
}

/** Shape of an `endorsekit.endorsement` row as selected below (date as text). */
export interface EndorsementRow {
  id: string;
  student_id: string;
  rule: string;
  label: string;
  scope: string | null;
  issued_on: string;
}

/** Pure: map a DB student row to the domain `Student`. */
export function mapStudentRow(row: StudentRow): Student {
  return { id: row.id, name: row.name };
}

/**
 * Pure: map a DB endorsement row to the domain `IssuedEndorsement`.
 *
 * Validates the `text` `rule` column against the closed `ValidityRule` set
 * with a runtime guard (not a bare cast): an unknown value fails loud here at
 * the persistence boundary rather than surfacing as a silent `undefined` /
 * `TypeError` inside the engine.
 */
export function mapEndorsementRow(row: EndorsementRow): IssuedEndorsement {
  if (!isValidityRule(row.rule)) {
    throw new Error(
      `endorsement ${row.id} has an unknown validity rule: ${JSON.stringify(row.rule)}`,
    );
  }
  const endorsement: IssuedEndorsement = {
    id: row.id,
    studentId: row.student_id,
    rule: row.rule,
    label: row.label,
    issuedOn: row.issued_on,
  };
  if (row.scope !== null) {
    endorsement.scope = row.scope;
  }
  return endorsement;
}

// One pooled connection PER connection string, created on first use and reused
// for the life of the (long-running, adapter-node) process. The string is
// threaded in from the factory (the single source of truth that already decided
// to use Postgres); it falls back to env.DATABASE_URL only when nothing was
// passed, so the factory's URL and the live connection never diverge.
//
// Keying by URL (not a single `let sql`) means a SECOND, different `databaseUrl`
// is no longer silently ignored — it gets its own pool — which matters for
// integration tests that swap the URL between cases. And because `postgres(url)`
// is synchronous with NO await between the `get` and the `set`, Node's
// single-threaded event loop cannot interleave two concurrent cold-starts into
// two pools for the same URL.
const pools = new Map<string, ReturnType<typeof postgres>>();
function client(databaseUrl?: string): ReturnType<typeof postgres> {
  const url = databaseUrl ?? env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set; cannot open the endorsekit Postgres adapter.",
    );
  }
  let pool = pools.get(url);
  if (!pool) {
    pool = postgres(url);
    pools.set(url, pool);
  }
  return pool;
}

/** An EndorsementRepository backed by the shared Cortex Postgres. */
export function postgresRepository(
  ownerCfiId: string,
  databaseUrl?: string,
): EndorsementRepository {
  const db = client(databaseUrl);
  return {
    listStudents: async () => {
      const rows = await db<StudentRow[]>`
        SELECT id, name
        FROM endorsekit.student
        WHERE owner_user_id = ${ownerCfiId}
        ORDER BY name`;
      return rows.map(mapStudentRow);
    },
    listEndorsements: async () => {
      const rows = await db<EndorsementRow[]>`
        SELECT id, student_id, rule, label, scope, issued_on::text AS issued_on
        FROM endorsekit.endorsement
        WHERE owner_user_id = ${ownerCfiId}
        ORDER BY issued_on`;
      return rows.map(mapEndorsementRow);
    },
  };
}

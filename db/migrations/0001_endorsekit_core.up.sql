-- endorsekit core tables — the two-table endorsement model
-- (product-research §3.3 / §4.1/§4.2): `student` is the CFI's roster (the
-- per-student rollup target), `endorsement` is the append-only registry of
-- what the CFI actually issued. The expiry engine reads these two relations.
--
-- These live in the gear's private `endorsekit` schema in the shared Cortex
-- Postgres. The platform's Cortex migration creates the empty `endorsekit`
-- namespace and grants the `endorsekit_app` role ownership; the gear owns its
-- own tables here. `CREATE SCHEMA IF NOT EXISTS` keeps this migration
-- self-contained so the CI db-round-trip lane can apply it against an empty
-- ephemeral Postgres without the platform migrations.
--
-- owner_user_id is the Cortex user id (cortex.users.id) — the CFI who owns the
-- roster and every endorsement. No cross-schema FK to cortex.users is declared:
-- the gear schema can SELECT cortex.* but must stay applyable in isolation.
-- Ownership is enforced by the adapter's owner predicate on every query
-- (mirrors the Go backend's per-request owner scoping; product-research §4.3).
--
-- Read-side slice: the registry's WRITE path (sealed, hash-chained issuance —
-- ADR-0002) lands later in the Go backend, which adds the seal/audit columns
-- and the append-only trigger. This migration carries only the columns the
-- read-side expiry engine needs, plus issued_on as the validity-clock anchor.

CREATE SCHEMA IF NOT EXISTS endorsekit;

CREATE TABLE endorsekit.student (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL,
    name          text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE endorsekit.endorsement (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL,
    student_id    uuid NOT NULL REFERENCES endorsekit.student (id) ON DELETE CASCADE,
    -- the validity-rule discriminator the engine dispatches on (each cited to a
    -- FAR: far_61_87_n_solo_90day, far_61_87_p_solo_addl_90day,
    -- far_61_93_solo_xc_90day, far_61_56_flight_review_24mo,
    -- far_61_35_knowledge_test_no_expiry — see web/src/lib/endorsements/types.ts).
    rule          text NOT NULL,
    label         text NOT NULL,
    scope         text,
    issued_on     date NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_owner_idx ON endorsekit.student (owner_user_id);
CREATE INDEX endorsement_owner_idx ON endorsekit.endorsement (owner_user_id);
CREATE INDEX endorsement_student_idx ON endorsekit.endorsement (student_id);

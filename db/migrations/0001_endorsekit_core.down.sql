-- Drop the gear's tables but NOT the `endorsekit` schema — the schema
-- namespace is owned by the platform (the Cortex gear-schemas migration), not
-- this gear. Dropping tables only keeps the up→down→up round-trip clean while
-- leaving the platform-owned namespace intact in production.

DROP TABLE IF EXISTS endorsekit.endorsement;
DROP TABLE IF EXISTS endorsekit.student;

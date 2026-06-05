import { describe, expect, it, vi } from "vitest";
import { repositoryFor } from "./factory";
import type { EndorsementRepository } from "./repository";

const PG: EndorsementRepository = {
  listStudents: async () => [],
  listEndorsements: async () => [],
};
const SEED: EndorsementRepository = {
  listStudents: async () => [],
  listEndorsements: async () => [],
};
const noop = () => {};

describe("repositoryFor", () => {
  it("uses the Postgres adapter when DATABASE_URL is set", () => {
    const r = repositoryFor(
      "postgres://x",
      "cfi1",
      new Date(),
      () => PG,
      () => SEED,
      noop,
    );
    expect(r).toBe(PG);
  });

  it.each([undefined, ""])(
    "uses the seed adapter when DATABASE_URL is %p",
    (url) => {
      const r = repositoryFor(
        url,
        "cfi1",
        new Date(),
        () => PG,
        () => SEED,
        noop,
      );
      expect(r).toBe(SEED);
    },
  );

  it("scopes the Postgres adapter to the owning CFI id", () => {
    let got = "";
    repositoryFor(
      "url",
      "cfi9",
      new Date(),
      (id) => ((got = id), PG),
      () => SEED,
      noop,
    );
    expect(got).toBe("cfi9");
  });

  it("passes `today` to the seed adapter", () => {
    const today = new Date(Date.UTC(2026, 0, 2));
    let got: Date | null = null;
    repositoryFor(
      undefined,
      "cfi1",
      today,
      () => PG,
      (t) => ((got = t), SEED),
      noop,
    );
    expect(got).toBe(today);
  });

  it("warns in seed mode so a missing DATABASE_URL is visible in the logs", () => {
    const warn = vi.fn();
    repositoryFor(
      undefined,
      "cfi1",
      new Date(),
      () => PG,
      () => SEED,
      warn,
    );
    expect(warn).toHaveBeenCalledOnce();
  });

  it("does not warn when Postgres is configured", () => {
    const warn = vi.fn();
    repositoryFor(
      "postgres://x",
      "cfi1",
      new Date(),
      () => PG,
      () => SEED,
      warn,
    );
    expect(warn).not.toHaveBeenCalled();
  });
});

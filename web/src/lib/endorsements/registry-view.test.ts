import { describe, expect, it } from "vitest";
import { buildRegistryView } from "./registry-view";
import type { EndorsementRepository } from "$lib/repo/repository";

const today = new Date(Date.UTC(2026, 0, 2));

describe("buildRegistryView", () => {
  it("returns roster + needAttention + asOf on success", async () => {
    const repo: EndorsementRepository = {
      listStudents: async () => [{ id: "s1", name: "Ada" }],
      listEndorsements: async () => [],
    };
    const view = await buildRegistryView(repo, today, "cfi1");
    expect(view.asOf).toBe("2026-01-02");
    expect(view.roster.map((r) => r.student.id)).toEqual(["s1"]);
    expect(typeof view.needAttention).toBe("number");
  });

  it("re-raises a DB/I-O failure as a 503 (not an opaque 500)", async () => {
    const repo: EndorsementRepository = {
      listStudents: async () => {
        throw new Error("ECONNREFUSED");
      },
      listEndorsements: async () => [],
    };
    await expect(buildRegistryView(repo, today, "cfi1")).rejects.toMatchObject({
      status: 503,
    });
  });

  it("re-raises a corrupt-row mapper throw as a 503", async () => {
    const repo: EndorsementRepository = {
      listStudents: async () => [],
      listEndorsements: async () => {
        throw new Error('unknown validity rule "bogus"');
      },
    };
    await expect(buildRegistryView(repo, today, "cfi1")).rejects.toMatchObject({
      status: 503,
    });
  });
});

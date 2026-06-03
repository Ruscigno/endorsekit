<script lang="ts">
  import type { PageData } from "./$types";
  import type { EndorsementHealth } from "$lib/endorsements/types";

  let { data }: { data: PageData } = $props();

  const HEALTH_LABEL: Record<EndorsementHealth, string> = {
    active: "Active",
    expiring_soon: "Expiring soon",
    expired: "Expired",
    no_expiry: "No expiry",
  };

  function remainingText(days: number | null): string {
    if (days === null) return "—";
    if (days < 0) return `${Math.abs(days)} days ago`;
    if (days === 0) return "today";
    return `in ${days} days`;
  }
</script>

<section class="reg">
  <header class="reg__head">
    <h1>Endorsement registry</h1>
    <p class="reg__sub">
      Signed in as {data.me.email} · as of {data.asOf} ·
      {#if data.needAttention === 0}
        <span class="ok">no endorsements need attention</span>
      {:else}
        <span class="warn"
          >{data.needAttention}
          {data.needAttention === 1 ? "student needs" : "students need"} attention</span
        >
      {/if}
    </p>
  </header>

  <ul class="students">
    {#each data.roster as row (row.student.id)}
      <li class="student">
        <div class="student__top">
          <span class="student__name">{row.student.name}</span>
          <span class="badge badge--{row.rollup}">{HEALTH_LABEL[row.rollup]}</span>
        </div>

        {#if row.endorsements.length === 0}
          <p class="student__empty">No endorsements issued yet.</p>
        {:else}
          <ul class="ends">
            {#each row.endorsements as e (e.id)}
              <li class="end end--{e.health}">
                <div class="end__top">
                  <span class="end__label">
                    {e.label}{#if e.scope}<span class="end__scope"> · {e.scope}</span
                      >{/if}
                  </span>
                  <span class="badge badge--{e.health}">{HEALTH_LABEL[e.health]}</span>
                </div>
                <div class="end__meta">
                  <span
                    >{e.expiresOn ? `Expires ${e.expiresOn}` : "No expiry"}</span
                  >
                  <span class="end__rel">{remainingText(e.daysRemaining)}</span>
                </div>
                <p class="end__detail">{e.detail}</p>
              </li>
            {/each}
          </ul>
        {/if}
      </li>
    {/each}
  </ul>

  <!--
    Aviation-domain disclaimer — calibrated regulatory-record bar
    (CLAUDE.md / .claude/rules/security.md). Must appear on the registry
    verdict surface; missing it is a launch-readiness defect.
  -->
  <p class="disclaimer">
    EndorseKit is recordkeeping software. The certificated flight instructor is
    solely responsible for the correctness, applicability, and currency of every
    endorsement issued under 14 CFR Part 61 and AC 61-65, and for retaining the
    records the regulations require. EndorseKit does not provide legal or
    regulatory advice and is not affiliated with the FAA.
  </p>
</section>

<style>
  .reg {
    max-width: 48rem;
    margin: 0 auto;
    padding: 2.5rem 1rem;
  }
  .reg__head h1 {
    font-size: 1.875rem;
    font-weight: 600;
    margin: 0;
  }
  .reg__sub {
    color: #64748b;
    margin-top: 0.25rem;
  }
  .ok {
    color: #15803d;
    font-weight: 600;
  }
  .warn {
    color: #b45309;
    font-weight: 600;
  }
  .students {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0 0;
    display: grid;
    gap: 1.25rem;
  }
  .student {
    border: 1px solid #e2e8f0;
    border-radius: 0.625rem;
    padding: 1rem 1.125rem;
  }
  .student__top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .student__name {
    font-size: 1.0625rem;
    font-weight: 600;
  }
  .student__empty {
    color: #94a3b8;
    font-size: 0.875rem;
    margin: 0.625rem 0 0;
  }
  .ends {
    list-style: none;
    padding: 0;
    margin: 0.875rem 0 0;
    display: grid;
    gap: 0.625rem;
  }
  .end {
    border: 1px solid #e2e8f0;
    border-left-width: 4px;
    border-radius: 0.5rem;
    padding: 0.75rem 0.875rem;
    background: #f8fafc;
  }
  .end--active {
    border-left-color: #16a34a;
  }
  .end--expiring_soon {
    border-left-color: #d97706;
  }
  .end--expired {
    border-left-color: #dc2626;
  }
  .end--no_expiry {
    border-left-color: #64748b;
  }
  .end__top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .end__label {
    font-weight: 600;
  }
  .end__scope {
    color: #64748b;
    font-weight: 400;
  }
  .badge {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    white-space: nowrap;
  }
  .badge--active {
    background: #dcfce7;
    color: #15803d;
  }
  .badge--expiring_soon {
    background: #fef3c7;
    color: #b45309;
  }
  .badge--expired {
    background: #fee2e2;
    color: #b91c1c;
  }
  .badge--no_expiry {
    background: #e2e8f0;
    color: #475569;
  }
  .end__meta {
    display: flex;
    justify-content: space-between;
    color: #475569;
    font-size: 0.875rem;
    margin-top: 0.375rem;
  }
  .end__detail {
    color: #94a3b8;
    font-size: 0.8125rem;
    margin: 0.5rem 0 0;
  }
  .disclaimer {
    margin-top: 1.75rem;
    padding-top: 1rem;
    border-top: 1px solid #e2e8f0;
    color: #94a3b8;
    font-size: 0.8125rem;
    line-height: 1.5;
  }
</style>

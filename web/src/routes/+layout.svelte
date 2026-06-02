<script lang="ts">
  import { setContext, onMount } from "svelte";
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";
  import {
    bindLocaleEvent,
    createLocaleStore,
    LOCALE_CONTEXT_KEY,
  } from "$lib/locale/store";

  let { children, data }: { children: Snippet; data: LayoutData } = $props();

  // Seed the locale store with the server-resolved locale (§9.1 step 4);
  // expose via setContext (§9.1 steps 6-7); subscribe to the shell's
  // `cortex:locale-changed` event on mount (§9.1 step 5).
  // svelte-ignore state_referenced_locally
  const localeStore = createLocaleStore(data.locale);
  setContext(LOCALE_CONTEXT_KEY, localeStore);
  $effect(() => {
    localeStore.set(data.locale);
  });
  onMount(() => bindLocaleEvent(localeStore));
</script>

<!--
  The header/footer/locale-switcher/account-menu/`part of Cortex` badge
  all live in <aviation-cortex-shell> per implementation_plan.md §6.
  This gear is forbidden from rendering its own chrome (§9.2 + §10.1.5).
-->
{@render children()}

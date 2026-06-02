<script lang="ts">
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<section class="mx-auto max-w-3xl px-4 py-12">
  <h1 class="text-3xl font-semibold">endorsekit</h1>
  <p class="mt-2 text-slate-400">
    Welcome, {data.me.email}. Trial ends or access expires
    {new Date(data.me.access_until).toLocaleDateString()}.
  </p>
  <p class="mt-6 text-slate-500">
    endorsekit is part of the Aviation Cortex bundle. Product surface lands here.
  </p>
</section>

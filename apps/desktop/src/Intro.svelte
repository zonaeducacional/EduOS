<script lang="ts">
  import { onMount } from 'svelte';
  import animation from './assets/intro.gif';
  import logo from './assets/logo.jpeg';

  let { onfinish }: { onfinish: () => void } = $props();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let source = $state(reducedMotion ? logo : animation);
  let leaving = $state(false);
  let displayTimer: ReturnType<typeof setTimeout> | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;

  function finish() {
    if (leaving) return;
    leaving = true;
    if (reducedMotion) onfinish();
    else exitTimer = setTimeout(onfinish, 250);
  }

  function loaded() {
    clearTimeout(displayTimer);
    displayTimer = setTimeout(finish, source === animation ? 3000 : 1000);
  }

  function failed() {
    if (source === animation) source = logo;
    else finish();
  }

  onMount(() => {
    const fallback = setTimeout(finish, 5500);
    return () => {
      clearTimeout(fallback);
      clearTimeout(displayTimer);
      clearTimeout(exitTimer);
    };
  });
</script>

<div class="intro" class:leaving role="status" aria-label="Iniciando EduOS">
  <img src={source} alt="" onload={loaded} onerror={failed} />
</div>

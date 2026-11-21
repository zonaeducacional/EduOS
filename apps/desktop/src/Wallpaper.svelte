<script lang="ts">
  let { image }: { image?: string } = $props();
</script>

<div class="wallpaper" aria-hidden="true" style:background-image={image ? `url("${image}")` : undefined}>
  {#if !image}
    <div class="orbit orbit-one"></div>
    <div class="orbit orbit-two"></div>
    <div class="orbit orbit-three"></div>
    <div class="wallpaper-grid"></div>
  {/if}
</div>

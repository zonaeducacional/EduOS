<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke, isTauri } from '@tauri-apps/api/core';
  import type { profileStorage } from '../profiles';

  let { storage }: { storage: ReturnType<typeof profileStorage> } = $props();
  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null;
  let color = $state('#5140b4');
  let size = $state(5);
  let status = $state('');
  let previous = $state.raw<ImageData | null>(null);
  let saving = $state(false);
  let pointer: number | null = null;

  onMount(() => {
    context = canvas.getContext('2d');
    if (!context) return;
    const saved = storage.read('drawing');
    if (saved) {
      const image = new Image();
      image.onload = () => context?.drawImage(image, 0, 0);
      image.src = saved;
    }
  });

  function point(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height] as const;
  }

  function start(event: PointerEvent) {
    if (!context || event.button !== 0 || pointer !== null) return;
    previous = context.getImageData(0, 0, canvas.width, canvas.height);
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    const [x,y] = point(event);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = size;
    context.beginPath();
    context.arc(x, y, size / 2, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(x, y);
  }

  function move(event: PointerEvent) {
    if (!context || pointer !== event.pointerId) return;
    const [x,y] = point(event);
    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
  }

  function save() {
    status = storage.write('drawing', canvas.toDataURL('image/png')) ? 'Desenho salvo neste perfil.' : 'Não foi possível salvar o desenho.';
  }

  function finish(event: PointerEvent) {
    if (pointer !== event.pointerId) return;
    pointer = null;
    save();
  }

  function clear() {
    previous = context?.getImageData(0, 0, canvas.width, canvas.height) ?? null;
    context?.clearRect(0, 0, canvas.width, canvas.height);
    save();
  }

  function undo() {
    if (!previous) return;
    context?.putImageData(previous, 0, 0);
    previous = null;
    save();
  }

  async function exportDrawing() {
    if (saving) return;
    saving = true;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error();
      if (isTauri()) {
        if (!await invoke<boolean>('builtin_save_binary', { name: 'desenho.png', bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) })) return;
      } else {
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = 'desenho.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      status = 'Desenho PNG exportado.';
    } catch { status = 'Não foi possível exportar o desenho.'; }
    finally { saving = false; }
  }
</script>

<div class="app-content builtin-tool">
  <div class="shop-actions">
    <label>Cor <input type="color" bind:value={color} /></label>
    <label>Espessura <input type="range" min="1" max="28" bind:value={size} /></label>
    <button class="catalog-secondary" type="button" disabled={!previous} onclick={undo}>Desfazer</button>
    <button class="catalog-secondary" type="button" disabled={saving} onclick={exportDrawing}>Exportar PNG</button>
    <button class="catalog-secondary" type="button" onclick={clear}>Limpar desenho</button>
  </div>
  <canvas width="720" height="420" aria-label="Prancheta de desenho" bind:this={canvas}
    onpointerdown={start} onpointermove={move} onpointerup={finish} onlostpointercapture={finish}></canvas>
  {#if status}<p class="app-status" role="status">{status}</p>{/if}
</div>

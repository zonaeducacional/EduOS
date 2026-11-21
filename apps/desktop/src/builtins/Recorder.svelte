<script lang="ts">
  import { onDestroy } from 'svelte';
  import { invoke, isTauri } from '@tauri-apps/api/core';

  const maxSize = 12 * 1024 * 1024;
  let recorder: MediaRecorder | undefined;
  let stream: MediaStream | undefined;
  let alive = true;
  let pending = $state(false);
  let recording = $state(false);
  let audio = $state<Blob | null>(null);
  let url = $state('');
  let status = $state('');
  let saving = $state(false);

  function preview(blob: Blob) {
    if (url) URL.revokeObjectURL(url);
    audio = blob;
    url = URL.createObjectURL(blob);
  }

  onDestroy(() => {
    alive = false;
    if (recorder?.state === 'recording') recorder.stop();
    stream?.getTracks().forEach((track) => track.stop());
    if (url) URL.revokeObjectURL(url);
  });

  async function record() {
    if (pending || recording) return;
    pending = true;
    status = '';
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('A gravação de áudio não está disponível neste ambiente.');
      if (isTauri()) await invoke('builtin_microphone');
      if (!alive) return;
      const available = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive) { available.getTracks().forEach((track) => track.stop()); return; }
      stream = available;
      const current = new MediaRecorder(stream);
      recorder = current;
      const chunks: Blob[] = [];
      let bytes = 0;
      let exceeded = false;
      current.ondataavailable = (event) => {
        bytes += event.data.size;
        if (bytes > maxSize) {
          exceeded = true;
          if (current.state === 'recording') current.stop();
        } else if (event.data.size) chunks.push(event.data);
      };
      current.onstop = () => {
        available.getTracks().forEach((track) => track.stop());
        if (!alive) return;
        recording = false;
        if (exceeded) { status = 'A gravação excedeu o limite de 12 MB. Grave um trecho menor.'; return; }
        if (!chunks.length) { status = 'Nenhum áudio foi capturado.'; return; }
        preview(new Blob(chunks, { type: current.mimeType }));
        status = 'Gravação pronta para ouvir e salvar.';
      };
      current.onerror = () => {
        available.getTracks().forEach((track) => track.stop());
        recording = false;
        if (alive) status = 'Não foi possível concluir a gravação.';
      };
      current.start(500);
      recording = true;
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      status = error instanceof DOMException ? 'O microfone está indisponível ou sem permissão.' :
        error instanceof Error ? error.message : 'Não foi possível acessar o microfone.';
    } finally { pending = false; }
  }

  function importAudio(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/') || file.size > maxSize) {
      status = 'Escolha um arquivo de áudio de até 12 MB.';
      return;
    }
    preview(file);
    status = 'Áudio local carregado.';
  }

  async function save() {
    if (!audio || saving) return;
    saving = true;
    try {
      let extension = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' :
        audio.type.includes('wav') ? 'wav' : audio.type.includes('mpeg') ? 'mp3' : 'webm';
      if (audio instanceof File) {
        const original = audio.name.split('.').at(-1)?.toLowerCase();
        if (original && ['mp3', 'wav', 'm4a', 'ogg', 'webm', 'flac', 'aac'].includes(original)) extension = original;
      }
      const name = `apresentacao.${extension}`;
      if (isTauri()) {
        const saved = await invoke<boolean>('builtin_save_binary', { name, bytes: Array.from(new Uint8Array(await audio.arrayBuffer())) });
        if (!saved) return;
      } else {
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.click();
      }
      status = 'Áudio salvo no destino escolhido.';
    } catch { status = 'Não foi possível salvar o áudio.'; }
    finally { saving = false; }
  }
</script>

<div class="app-content builtin-tool">
  <div class="shop-actions">
    {#if recording}<button type="button" class="catalog-secondary" onclick={() => recorder?.stop()}>Parar gravação</button>
    {:else}<button type="button" class="catalog-secondary" disabled={pending} onclick={record}>Gravar apresentação</button>{/if}
    <label class="builtin-file catalog-secondary">Abrir áudio<input aria-label="Abrir áudio" type="file" accept="audio/*" disabled={pending || recording} onchange={importAudio} /></label>
    {#if audio}<button type="button" class="catalog-secondary" disabled={saving || recording} onclick={save}>Salvar áudio</button>{/if}
  </div>
  {#if url}<audio src={url} controls aria-label="Ouvir apresentação" onerror={() => { status = 'O formato do áudio não pôde ser reproduzido.'; }}></audio>{/if}
  {#if status}<p class="app-status" role="status">{status}</p>{/if}
</div>

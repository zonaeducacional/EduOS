<script lang="ts">
  import { tick } from 'svelte';
  import type { profileStorage } from '../profiles';
  import { readSaved, saveText } from './local';

  let { storage }: { storage: ReturnType<typeof profileStorage> } = $props();
  const limit = 512 * 1024;
  function initial() {
    return readSaved(storage.read, 'simple-editor', { name: 'rascunho.txt', text: storage.read('markdown-source') ?? '' });
  }
  let document = $state(initial());
  let status = $state('');
  let busy = $state(false);
  let editor: HTMLTextAreaElement;
  let position = $state('Linha 1, coluna 1');

  function saveDraft() {
    status = storage.write('simple-editor', JSON.stringify(document)) ?
      'Rascunho salvo neste perfil.' : 'Não foi possível salvar o rascunho.';
  }

  function updatePosition() {
    const lines = editor.value.slice(0, editor.selectionStart).split('\n');
    position = `Linha ${lines.length}, coluna ${(lines.at(-1)?.length ?? 0) + 1}`;
  }

  function update(event: Event & { currentTarget: HTMLTextAreaElement }) {
    document.text = event.currentTarget.value;
    saveDraft();
    updatePosition();
  }

  async function openFile(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || busy) return;
    busy = true;
    try {
      if (file.size > limit) throw new Error('Escolha um arquivo de texto de até 512 KiB.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      if (text.includes('\u0000')) throw new Error('Escolha um arquivo de texto UTF-8.');
      document = { name: file.name, text };
      saveDraft();
      status = `Arquivo aberto: ${file.name}`;
      await tick();
      editor.focus();
      editor.setSelectionRange(0, 0);
      updatePosition();
    } catch (error) {
      status = error instanceof Error ? error.message : 'Não foi possível abrir o arquivo.';
    } finally { busy = false; }
  }

  async function exportFile() {
    if (busy) return;
    busy = true;
    try {
      if (await saveText(document.name.trim() || 'rascunho.txt', document.text)) status = 'Arquivo salvo no destino escolhido.';
    } catch { status = 'Não foi possível salvar o arquivo. Confira o nome e o destino.'; }
    finally { busy = false; }
  }

  async function keys(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      await exportFile();
    }
  }
</script>

<div class="app-content builtin-tool">
  <div class="shop-actions">
    <label class="builtin-file catalog-secondary">Abrir arquivo de texto<input aria-label="Abrir arquivo de texto" type="file" disabled={busy} onchange={openFile} /></label>
    <button class="catalog-secondary" type="button" disabled={busy} onclick={exportFile}>Salvar como</button>
  </div>
  <label>Nome do arquivo<input maxlength={120} bind:value={document.name} onchange={saveDraft} /></label>
  <textarea aria-label="Conteúdo do arquivo" placeholder="Digite seu texto ou código…" bind:this={editor} value={document.text}
    oninput={update} onselect={updatePosition} onkeydown={keys} spellcheck="false" maxlength={limit}></textarea>
  <p class="app-status">{position}</p>
  {#if status}<p class="app-status" role="status">{status}</p>{/if}
</div>

<script lang="ts">
  import { NotebookPen } from 'lucide-svelte';
  import type { profileStorage } from './profiles';

  let { storage }: { storage: ReturnType<typeof profileStorage> } = $props();
  function loadNotes() { return storage.read('notes') ?? ''; }

  let notes = $state(loadNotes());
  let saved = $state(true);

  function update(event: Event & { currentTarget: HTMLTextAreaElement }) {
    notes = event.currentTarget.value;
    saved = storage.write('notes', notes);
  }
</script>

<div class="notes app-content">
  <div class="app-heading">
    <span class="app-icon notes-icon"><NotebookPen size={21} /></span>
    <div><h2>Minhas anotações</h2><p>Ideias, resumos e lembretes</p></div>
  </div>
  <textarea aria-label="Minhas anotações" value={notes} oninput={update} placeholder="Comece a escrever aqui…" spellcheck="true"></textarea>
  <p class="app-status" role="status">{saved ? 'Salvamento automático neste dispositivo' : 'Não foi possível salvar neste dispositivo.'}</p>
</div>

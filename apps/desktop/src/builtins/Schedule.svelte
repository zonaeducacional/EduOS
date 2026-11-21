<script lang="ts">
  import { onDestroy } from 'svelte';
  import { criarProjetoPadrao } from './horario/shared/defaultProject';
  import { validarEstrutura } from './horario/shared/rules';
  import type { ProjetoHorario, SolverResult } from './horario/shared/types';
  import type { profileStorage } from '../profiles';
  import { saveText } from './local';

  let { storage }: { storage: ReturnType<typeof profileStorage> } = $props();
  function initial() { return storage.read('schedule') ?? JSON.stringify(criarProjetoPadrao(), null, 2); }
  let source = $state(initial());
  function savedProject() {
    try { return parse(initial()); }
    catch { return null; }
  }
  let project = $state.raw<ProjetoHorario | null>(savedProject());
  let result = $state.raw<SolverResult | null>(null);
  let status = $state('');
  let busy = $state(false);
  let editing = $state(false);
  let worker: Worker | undefined;
  const day = ['', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

  function stop() {
    worker?.terminate();
    worker = undefined;
    busy = false;
  }
  onDestroy(stop);

  function parse(value: string): ProjetoHorario {
    const data = JSON.parse(value) as ProjetoHorario;
    validarEstrutura(data);
    return data;
  }

  async function importSchedule(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('O arquivo excede 2 MB.');
      const text = await file.text();
      project = parse(text);
      source = text;
      result = null;
      status = storage.write('schedule', source) ? 'Cadastro de horários carregado e salvo.' : 'Cadastro carregado. Exporte o arquivo para salvar.';
    } catch (error) { status = error instanceof Error ? error.message : 'Cadastro inválido.'; }
  }

  function generate() {
    stop();
    result = null;
    try {
      project = parse(source);
      busy = true;
      status = 'Preparando a geração…';
      worker = new Worker(new URL('./horario/worker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent<{ progress?: string; result?: SolverResult }>) => {
        if (event.data.progress) status = event.data.progress;
        if (event.data.result && project) {
          result = event.data.result;
          if (result.sucesso) {
            project = { ...project, gradeHorario: result.grade, ultimaModificacao: new Date().toISOString() };
            source = JSON.stringify(project, null, 2);
            status = storage.write('schedule', source) ? result.mensagem : result.mensagem + ' Salve o arquivo para preservar a grade.';
          } else status = result.mensagem;
          stop();
        }
      };
      worker.onerror = () => { stop(); status = 'Não foi possível executar o gerador de horários.'; };
      worker.postMessage(project);
    } catch (error) {
      stop();
      status = error instanceof Error ? error.message : 'Cadastro inválido.';
    }
  }

  async function exportSchedule() {
    try {
      parse(source);
      if (await saveText('horario.grade', source)) status = 'Arquivo de horários exportado.';
    } catch { status = 'Não foi possível exportar este cadastro.'; }
  }
</script>

<div class="app-content builtin-tool">
  <div class="shop-actions">
    <label class="builtin-file catalog-secondary">Importar .grade<input aria-label="Importar .grade" type="file" accept=".grade,.json" disabled={busy} onchange={importSchedule} /></label>
    <button class="catalog-secondary" type="button" disabled={busy} aria-pressed={editing} onclick={() => { editing = !editing; }}>Editar cadastro</button>
    <button class="catalog-secondary" type="button" disabled={busy} onclick={generate}>Gerar horário</button>
    <button class="catalog-secondary" type="button" disabled={busy} onclick={exportSchedule}>Exportar .grade</button>
    {#if busy}<button class="catalog-secondary" type="button" onclick={() => { stop(); status = 'Geração cancelada.'; }}>Cancelar</button>{/if}
  </div>
  {#if project && !project.gradeHorario.length && !busy}<p class="app-status">Cadastro: {project.nomeEscola}. Importe seu arquivo .grade ou gere um horário com este cadastro.</p>{/if}
  {#if editing}<textarea aria-label="Cadastro JSON de horários" bind:value={source} readonly={busy}></textarea>{/if}
  {#if status}<p class="app-status" role="status">{status}</p>{/if}
  {#if result?.conflitos?.length}<ul>{#each result.conflitos as conflict, index (index)}<li>{conflict}</li>{/each}</ul>{/if}
  {#if project?.gradeHorario.length && !busy}
    <table class="builtin-table">
      <thead><tr><th>Dia</th><th>Tempo</th><th>Turma</th><th>Disciplina</th><th>Professor</th></tr></thead>
      <tbody>{#each project.gradeHorario as lesson (lesson.id)}
        <tr><td>{day[lesson.diaSemana]}</td><td>{lesson.tempoNumero}</td>
          <td>{project.turmas.find(({ id }) => id === lesson.turmaId)?.nome}</td>
          <td>{project.disciplinas.find(({ id }) => id === lesson.disciplinaId)?.nome}</td>
          <td>{project.professores.find(({ id }) => id === lesson.professorId)?.nome}</td></tr>
      {/each}</tbody>
    </table>
  {/if}
</div>

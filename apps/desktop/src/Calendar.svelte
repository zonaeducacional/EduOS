<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';

  let { now, initialFocus }: { now: Date; initialFocus: (element: HTMLButtonElement) => void } = $props();
  let monthOffset = $state(0);
  let month = $derived(new Date(now.getFullYear(), now.getMonth() + monthOffset, 1));
  let dayCount = $derived(new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate());
  let days = $derived(Array.from({ length: dayCount }, (_, index) => index + 1));
  const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
  const dayFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' });
  const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
</script>

<section class="popover calendar" id="calendar" aria-label="Calendário">
  <p class="calendar-today">{dayFormat.format(now)}</p>
  <div class="calendar-heading">
    <h2 aria-live="polite">{monthFormat.format(month)}</h2>
    <button class="icon-button" type="button" aria-label="Mês anterior" {@attach initialFocus} onclick={() => monthOffset--}><ChevronLeft size={17} /></button>
    <button class="icon-button" type="button" aria-label="Próximo mês" onclick={() => monthOffset++}><ChevronRight size={17} /></button>
  </div>
  <table aria-label={monthFormat.format(month)}>
    <thead><tr>{#each weekdays as day (day)}<th scope="col">{day}</th>{/each}</tr></thead>
    <tbody>
      {#each Array.from({ length: Math.ceil((month.getDay() + dayCount) / 7) }, (_, row) => row) as row (row)}
        <tr>
          {#each weekdays as weekday, column (weekday)}
            {@const day = days[row * 7 + column - month.getDay()]}
            <td>
              {#if day}
                <span aria-current={monthOffset === 0 && day === now.getDate() ? 'date' : undefined}>{day}</span>
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
  <button class="setting calendar-reset" type="button" onclick={() => { monthOffset = 0; }}>Voltar para hoje</button>
</section>

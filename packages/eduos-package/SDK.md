# SDK EduOS para módulos WebAssembly

O ponto de entrada de um app executável é um módulo `.wasm` sem imports. O EduOS interpreta o módulo sem WASI, DOM, rede ou dependências privilegiadas. O hospedeiro cria uma instância por evento e renderiza apenas os controles descritos em JSON.

## Interface entre hospedeiro e módulo

| Exportação | Tipo | Uso |
| --- | --- | --- |
| `memory` | Memória linear | Canal de entrada e saída |
| `eduos_alloc` | `(i32) → i32` | Reserva bytes para a entrada UTF-8 e devolve o endereço |
| `eduos_render` | `(i32, i32) → i64` | Recebe endereço e comprimento da entrada; devolve endereço nos 32 bits superiores e comprimento nos 32 bits inferiores |

A entrada contém `action`, `fields`, `state` e `text`. `action` é `start` na abertura, ou o ID de um botão acionado. `fields` mapeia cada ID ao texto digitado. `state` recebe o estado da última saída ou `null`. `text` é o texto de um recurso ou de uma leitura autorizada, ou `null`.

A saída contém `text` e pode conter `fields`, `buttons` e `state`. Um campo tem `id`, `label` e `value` opcional. Um botão tem `id`, `label`, `effect` e `text` opcionais. Sem `effect`, clicar apenas entrega o evento ao módulo. IDs têm de 1 a 64 caracteres ASCII alfanuméricos, hífen ou sublinhado. O hospedeiro renderiza o conteúdo como texto.

## Ações mediadas

| Efeito | Operação |
| --- | --- |
| `resource_read` | Lê texto UTF-8 de um caminho dentro do próprio pacote assinado |
| `file_read` | Abre o seletor de arquivos do EduOS e entrega somente o texto escolhido |
| `file_write` | Abre o seletor de destino e grava o texto fornecido |
| `clipboard_read` | Lê texto da área de transferência |
| `clipboard_write` | Copia o texto fornecido |
| `notifications` | Mostra um aviso na janela do aplicativo |

Os efeitos exigem um clique. O hospedeiro verifica a assinatura, o perfil, a versão e as permissões concedidas a cada evento. As operações de arquivo sempre passam por um seletor. A notificação é interna ao EduOS. O módulo recebe somente os dados da operação autorizada.

O módulo pode ter até 2 MiB, a memória linear até 16 MiB e o JSON de cada mensagem até 96 KiB. As operações de texto têm limite de 48 KiB. A saída aceita até 16 campos e 16 botões. O interpretador também limita a quantidade de instruções por evento.

O [exemplo da Calculadora](../../examples/calculadora/README.md) inclui código e um recurso WebAssembly portátil pronto para assinar no Estúdio.

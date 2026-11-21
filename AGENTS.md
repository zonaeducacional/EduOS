# EduOS

Execute os comandos a partir da raiz do monorepo com Node.js 22.12+ (na linha 22) ou 24+ e pnpm 10.32.1. Para compilar o aplicativo nativo, instale Rust estável e as dependências do [Tauri 2 para seu sistema](https://v2.tauri.app/start/prerequisites/).

| Comando | Uso |
| --- | --- |
| `pnpm install --frozen-lockfile` | Instalar dependências a partir do lockfile |
| `pnpm tauri dev` | Abrir o aplicativo nativo com recarga durante o desenvolvimento |
| `pnpm dev` | Desenvolver a interface no navegador em http://127.0.0.1:1420 |
| `pnpm build` | Compilar a interface |
| `pnpm build:factory` | Compilar a interface e os seis apps do Puter, com Git, tar, npm e acesso à internet |
| `pnpm tauri build --debug --bundles deb` | Gerar o instalador de teste para Linux |
| `pnpm lint` | Executar ESLint |
| `pnpm svelte-check` | Validar Svelte e TypeScript estrito |
| `pnpm test` | Executar os testes automatizados |
| `pnpm tauri build --no-bundle` | Compilar o executável sem gerar instaladores |
| `pnpm tauri build --debug --no-bundle` | Compilar o executável de depuração com os recursos locais |

O executável fica em `apps/desktop/src-tauri/target/release/` ou `target/debug/` dentro do mesmo diretório Rust, salvo se o Cargo estiver configurado para outro destino.

Para o aceite offline, execute o binário compilado diretamente com a rede desabilitada e sem o Vite. Em Linux com namespaces de usuário habilitados e sessão X11, use `unshare -Urn apps/desktop/src-tauri/target/debug/eduos`. Verifique a busca por “matemática”, abra a Calculadora e o Bloco de notas e use os dois na mesma sessão. Teste os controles da janela e da barra de tarefas com mouse e teclado. Mude o papel de parede para um dos modelos Moderno, mude o tema e escreva uma anotação, feche o EduOS e reabra para conferir a persistência.

Para o aceite dos perfis, crie o Administrador, abra **Gerenciar perfis** na barra inferior e crie um Estudante. Em **Aplicativos liberados**, desmarque Bloco de notas para Estudante. Troque de perfil e confirme na dock, na área de trabalho e no menu Iniciar que somente a Calculadora aparece. Mude o papel de parede e reinicie o executável para conferir que o Estudante conserva a preferência e que o Administrador pede senha.

Para a biblioteca de pacotes, rode `cargo test --locked --manifest-path packages/eduos-package/Cargo.toml`. Com as dependências no cache, acrescente `--offline` para executar sem rede.

Para testar a Lojinha, rode `cargo test --locked --manifest-path packages/eduos-store/Cargo.toml`. A interface fica em **Gerenciar perfis → Estúdio e Lojinha** no Tauri. Use uma pasta local limpa com `manifest.json` na raiz e os recursos declarados no manifesto, conforme `packages/eduos-package/FORMAT.md`. Importe a pasta, assine o pacote, autorize a chave pública na Lojinha e importe o arquivo gerado. Revise os perfis e as permissões antes de confirmar. Para testar atualização e reversão, repita com o mesmo ID, uma versão maior e a mesma chave.

Para testar a vitrine, selecione **Publicar na vitrine** em vez de confirmar a instalação na administração. Escolha Estudante na publicação e confirme que o pacote aparece somente nos perfis liberados. Abra a Lojinha na dock, revise as permissões e confirme a instalação.

Para a execução isolada, rode `cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml`. O aplicativo de demonstração é importado da pasta `examples/calculadora/pacote`. O [README do exemplo](examples/calculadora/README.md) descreve o fluxo de assinatura, instalação e abertura pelo menu Iniciar.

Para a vitrine online central, consulte [Lojinha online do EduOS](apps/lojinha-web/README.md). O serviço guarda os cards publicados e rascunhos, e o botão **Vitrine online** da Lojinha abre o endereço configurado na compilação.

## Instaladores de teste

O fluxo manual [Instaladores de teste do EduOS](.github/workflows/installers.yml) gera artefatos para Linux x64 (`.deb`), Windows x64 (`-setup.exe`), macOS Apple Silicon e macOS Intel (`.dmg`). Depois que o repositório estiver no GitHub, execute o fluxo pela aba **Actions** e baixe o instalador correspondente no resultado. Os artefatos são para teste. Valide a instalação em cada sistema e configure a assinatura do Windows e a assinatura e notarização do macOS antes de distribuir.

- Defina a variável de repositório `EDUOS_WEB_STORE_URL` com a origem HTTPS pública da Lojinha quando ela tiver sido publicada.
- Para incluir os originais do VibeLab Horário 1.2.0, configure os segredos `EDUOS_VIBELAB_HORARIO_APPIMAGE_URL` e `EDUOS_VIBELAB_HORARIO_EXE_URL` com URLs HTTPS de download. O fluxo verifica os hashes dos dois executáveis.
- Para incluir Gestão de Notas no Linux, configure o segredo `EDUOS_GESTAO_NOTAS_APPIMAGE_URL` e a variável `EDUOS_GESTAO_NOTAS_APPIMAGE_SHA256`.
- O fluxo gera o instalador de teste com os recursos disponíveis. O Mini Navegador é empacotado no Linux x64, e a vitrine abre no navegador do sistema no Windows e no macOS. Gestão de Notas tem build fornecido para Linux x64. No macOS, o VibeLab Horário ainda precisa de um build original.

Para compilar localmente, use `pnpm tauri build --bundles deb` no Linux, `pnpm tauri build --bundles nsis` no Windows ou `pnpm tauri build --bundles dmg` no macOS. No Windows x64, defina `EDUOS_VIBELAB_HORARIO_EXE` com o caminho do executável original. Confira a recuperação de dados e a troca de perfis no Windows com o Horário instalado.

## Ponto de retomada

### Estado salvo em 21/11/2026

O objetivo é instalar o EduOS como um programa no sistema já usado pelo computador, com instaladores próprios para Linux, Windows e macOS. O trabalho atual usa o Tauri. A compilação integrada e testada é a de Linux x86-64. A última versão local abre em `apps/desktop/src-tauri/target/debug/eduos`. O último instalador de teste é `apps/desktop/src-tauri/target/debug/bundle/deb/EduOS_0.1.0_amd64.deb`.

- A janela inicial abre em 1280 × 720. A animação mantém sua proporção e o fundo da tela de perfis ocupa toda a largura. O seletor de papel de parede tem as quatro imagens locais **Moderno 1** a **Moderno 4**, com miniaturas e preferência por perfil.
- **Arquivos · VibeLab** é o gerenciador padrão do EduOS, com ícone na barra inferior e acesso à pasta de cada perfil. A tela branca no Linux foi corrigida comparando esquema, host e porta do endereço local. O Dolphin continua sendo o padrão do KDE.
- Em **Educação**, a Biblioteca funciona offline e importa PDF com texto, DOCX e Markdown. **Gestão de Notas** e **VibeLab Horário 1.2.0** são os AppImages originais distribuídos com o instalador Linux. Feche-os antes de trocar de perfil.
- Em **Internet**, o Mini Navegador usa Electron 45.4.1, com sandbox, sessões separadas por perfil e páginas externas isoladas da interface privilegiada. Abas, redirecionamento e favoritos foram testados no Electron.
- Em **Jogos**, Jogo dos Pontinhos e Quadro Magnético de Poesia foram empacotados a partir dos HTMLs de `/home/sergio/Downloads/GAMES/`. Os dois foram testados sem rede. O Quadro teve uma correção na Oficina Livre, e a exportação PNG foi testada.

Na retomada, priorizar os instaladores e os testes nativos de Windows e macOS. Já existe um executável Windows do VibeLab Horário na pasta `artifacts/release-v1.2.0` do projeto original. A integração desse build e os builds macOS ainda estão pendentes. Para Gestão de Notas, localizar o projeto-fonte ou os builds originais de Windows e macOS. A conversão dos dois apps para pacotes portáteis `.eduos` permanece em aberto. A SDK atual executa WebAssembly com UI declarativa, enquanto os originais usam Electron. Manter também na lista o FocoEditor, o Salinas OCR e a validação nativa de login e exportação dos apps Puter.

### Histórico e origens

O EduOS já abre no Tauri e tem área de trabalho em pt-BR, perfis locais, Estúdio, Lojinha offline, categorias no Iniciar e execução de módulos WebAssembly pela SDK. A última compilação local fica em `apps/desktop/src-tauri/target/debug/eduos`. A Fase 3 foi validada em Linux sem rede com os mesmos dois pacotes de `examples/calculadora/demonstracao`. Windows e macOS ainda precisam de teste nativo. Os instaladores pertencem à Fase 4.

O usuário quer que os aplicativos de fábrica acompanhem a instalação do EduOS. Ele corrigiu a seleção anterior porque versões simplificadas foram apresentadas como se fossem os projetos originais. A seleção explícita atual é:

| Categoria | Aplicativos solicitados |
| --- | --- |
| Escritório | Escola Office, Salinas OCR, FocoEditor |
| Desenvolvimento | Criar um editor simples |
| Educação | Vibe Lab Horário, Gestão de Notas, Gerenciador de Arquivos VibeLab |

O Editor simples já faz parte da compilação. O Escola Office original foi incluído em **Iniciar → Escritório**, abre em janela própria e sua abertura foi verificada no Linux sem rede. Sua distribuição usa os recursos do build original e a licença local. O VibeLab é o gerenciador de arquivos padrão do EduOS. Em **Iniciar → Educação**, Gestão de Notas e VibeLab Horário usam os AppImages originais incluídos no instalador Linux x86-64.

| Aplicativo | Origem local |
| --- | --- |
| Escola Office | `/home/sergio/Documentos/Arquivos_Area_de_Trabalho/escolaoffice-main.zip` |
| Vibe Lab Horário | `/home/sergio/Projetos/horariolivre` |
| Gerenciador de Arquivos VibeLab | Fonte em `/home/sergio/.gemini/antigravity/scratch/spec_kit_workspace/LinuxExplorer`; executável Linux em `/opt/VibeLab/vibelab-explorer` |
| FocoEditor | `/home/sergio/Downloads/Meus_Apps/FocoEditor-1.0.0.AppImage` |
| Gestão de Notas | `/home/sergio/Downloads/Meus_Apps/sistema-de-gestão-de-notas-escolares.AppImage` |
| Salinas OCR | Lançador `/home/sergio/.local/share/applications/SalinasOCR.desktop`; o `start.sh` indicado em `/home/sergio/.gemini/antigravity/scratch/salinas-history-ocr/` está ausente |

O build Linux procura o AppImage do VibeLab Horário 1.2.0 em `artifacts/release-v1.2.0` na pasta `horariolivre` e usa o AppImage de Gestão de Notas listado acima. Para compilar usando outra localização, defina `EDUOS_VIBELAB_HORARIO_APPIMAGE` e `EDUOS_GESTAO_NOTAS_APPIMAGE`. Os AppImages são copiados para os recursos do instalador.

O usuário escolheu distribuir os aplicativos com o instalador do EduOS. A seleção do [HeyPuter Everything](https://github.com/HeyPuter/everything) foi conferida na revisão `01fa74d865e348532779263303186436eb99cd1a`:

| Categoria | App | Licença upstream | Condição para integração |
| --- | --- | --- | --- |
| Escritório | Notes | AGPL-3.0-only | O build de produção usa uma conta Puter para os cadernos e anotações. |
| Colaboração | Email | AGPL-3.0-only | O envio e o recebimento dependem da conta `@puter.email` e dos serviços de correio do Puter. |
| Gráficos | Photo Studio | AGPL-3.0-only | Validar abertura, edição e exportação local. Recursos de IA dependem de conta Puter. |
| Gráficos | Video Studio | AGPL-3.0-only | Validar reprodução e exportação na webview de cada plataforma. |
| Gráficos | Audio Studio | AGPL-3.0-only | Validar reprodução, edição e exportação com AudioWorklet e WebAssembly. |
| Gráficos | Music Studio | MIT | Validar projetos locais em IndexedDB e exportação WAV e MIDI com o motor WebAssembly. |

Os seis apps são compilados da revisão acima e acompanham a compilação do Tauri. Cada janela carrega o próprio app em localhost e usa os serviços do Puter pela internet. Para desenvolvimento nativo, execute `pnpm build:factory` antes de `pnpm tauri dev`. Para o aceite, abra os apps pelo Iniciar, teste o login do Notes e do Email com uma conta de teste e confira a importação e exportação nos quatro estúdios. Repita a troca de perfil e verifique se as janelas e o estado de login pertencem ao perfil correto.

O bundle inclui as licenças e os avisos copiados das dependências de produção, além do arquivo `apps/desktop/dist/puter/codigo-fonte.tar.gz` com a origem dos builds.

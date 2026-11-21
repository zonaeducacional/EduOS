# Arquitetura do EduOS

## Fases 0 e 1

O monorepo pnpm reúne o shell desktop em `apps/desktop` e as regras puras em `packages/desktop-core`. O Tauri 2 hospeda uma única webview nativa. A interface usa Svelte 5, Vite e TypeScript estrito. O idioma é pt-BR, incluindo busca insensível a acentos e data, hora e separador decimal localizados.

O núcleo modela foco, ordem de empilhamento, estado minimizado e maximizado e geometria restaurável. O shell renderiza cada janela como uma região na área útil acima da barra de tarefas. Cada app tem uma instância por sessão. A barra de tarefas lista as janelas abertas e alterna o foco e a minimização. A dock central oferece o menu Iniciar com busca e lançadores fixos. O título e o controle de redimensionamento aceitam arraste e ajuste por setas após Enter. O Escape restaura a geometria anterior ao ajuste.

A Calculadora e o Bloco de notas são componentes integrados ao frontend. A calculadora mantém seu estado enquanto a janela estiver aberta, inclusive minimizada. O tema, o papel de parede, a visibilidade dos atalhos na área de trabalho e as anotações usam chaves versionadas em `localStorage` na webview, separadas dos dados do navegador de desenvolvimento. O painel Aparência oferece sete papéis de parede integrados e importa imagens PNG, JPEG e WebP de até 40 MB, com redução local das imagens maiores antes de salvar. O alto contraste usa fundo liso. A geometria e as janelas abertas pertencem à sessão atual.

O executável incorpora os recursos compilados. A CSP de produção bloqueia conexões externas e frames e permite apenas o canal local de IPC do Tauri. Fontes de sistema, ícones e estilos dispensam CDNs. O Vite escuta em loopback no desenvolvimento.

## Fase 2

O EducOS abre o seletor de perfis após a introdução. Na primeira execução, cria o perfil Administrador. A senha é verificada localmente com PBKDF2-SHA-256, um salt aleatório e 600 mil iterações. O EducOS guarda o salt e o hash. A sessão de administração precisa ser desbloqueada a cada nova execução ou troca de perfil.

O Administrador gerencia perfis Professor e Estudante e concede acesso por função aos apps integrados. Perfis desativados saem do seletor e preservam seus dados. A sessão aplica as regras ao catálogo e ao ponto de abertura de janelas. A troca de perfil encerra as janelas da sessão anterior.

O perfil Administrador assume as chaves de preferências e anotações legadas. Os demais perfis usam chaves com prefixos próprios. Perfis, permissões e dados ficam no armazenamento local da webview. O controle de acesso se aplica aos fluxos do EduOS. A proteção do armazenamento no sistema de arquivos depende da conta do sistema operacional.

## Fase 3

A biblioteca Rust `packages/eduos-package` define o formato portátil e compartilha a validação entre assinatura e verificação. O verificador recebe as chaves aceitas do ambiente hospedeiro. A assinatura confirma o manifesto, os caminhos e os bytes dos recursos, e o verificador devolve somente recursos validados. Consulte a [especificação do formato](packages/eduos-package/FORMAT.md).

O Estúdio e a Lojinha estão no painel do Administrador. A janela local principal recebe permissões específicas do Tauri. Os comandos de arquivos abrem seletores nativos e recebem um identificador de sessão efêmero. A chave do Estúdio fica cifrada em disco e requer uma senha própria. As cópias de chave usam Argon2id v19 com 64 MiB, 3 passes e 1 via, além de XChaCha20-Poly1305 com salt e nonce aleatórios. A chave pública é exportada como 32 bytes em `.eduospub`. A Lojinha aceita chaves públicas por ação explícita do administrador.

A Lojinha armazena os pacotes no SQLite local. A instalação confere a assinatura novamente na mesma transação que grava o pacote e as concessões revisadas. As atualizações exigem precedência SemVer maior e o mesmo signatário. A transação preserva a versão imediatamente anterior e suas concessões. A reversão valida a versão anterior antes de ativá-la.

A vitrine interna é acessível pelo menu Iniciar e pela dock. O administrador publica o pacote verificado com os perfis e as permissões aprovados. A vitrine consulta a publicação conforme o perfil atual, e a instalação é local ao dispositivo. A confirmação confere novamente a assinatura, a versão e as concessões da publicação. Retirar um pacote da vitrine encerra sua oferta e preserva instalações existentes.

Os apps WebAssembly instalados aparecem no Iniciar conforme o perfil e a categoria. O interpretador Wasmi roda o código em uma instância por evento, sem imports ou WASI, com limites de memória e instruções. A janela apresenta controles declarativos e envia eventos pela SDK. O hospedeiro verifica a assinatura, o perfil, a versão e as permissões a cada evento e medeia recursos locais, seletores de arquivos, área de transferência e avisos internos. Consulte o [contrato da SDK](packages/eduos-package/SDK.md).

## Apps de fábrica

A compilação incorpora Editor simples, Vibe Lab Horário, Bloco de notas, Desenho Vibe, Marcadores, Gravador de Slam, Arquivos do EduOS e Calculadora. O catálogo interno fornece um app por categoria no menu Iniciar. A administração pode restringir os apps por função. Perfis existentes recebem os novos apps mantendo as concessões anteriores de Calculadora e Bloco de notas.

O Vibe Lab Horário reutiliza o solucionador CSP e as regras MIT do código local. Um Worker calcula horários offline a partir de um cadastro `.grade`. A primeira abertura usa um cadastro de exemplo. Marcadores arquiva o endereço e extrai o texto de páginas HTML escolhidas. Arquivos do EduOS usa uma pasta gerenciada por perfil e seletores nativos de importação e exportação. O Gravador de Slam pede acesso ao microfone quando o usuário inicia uma gravação e exporta o áudio para um destino escolhido.

O Escola Office usa o build original da suíte e mantém sua licença. Os recursos da interface ficam embutidos no executável e a janela dedicada abre pelo menu **Iniciar → Escritório**. O CSS usa fontes locais disponíveis no sistema. A janela restringe navegação a seu documento local e fica fora das permissões da janela principal. Os seletores e exportações que dependem de serviços externos ou janelas auxiliares requerem validação adicional.

A Biblioteca usa o HTML distribuído com o aplicativo original e abre em **Iniciar → Educação**. A janela serve o arquivo na interface de loopback, bloqueia conexões externas e guarda o acervo em IndexedDB por perfil do EduOS.

Em **Iniciar → Jogos**, o Jogo dos Pontinhos e o Quadro Magnético de Poesia abrem os HTMLs originais em janelas offline. Cada jogo usa um endereço de loopback próprio e mantém seus dados locais separados por perfil.

Em **Iniciar → Sistema → Arquivos · VibeLab**, o EduOS abre a interface original do VibeLab em uma janela Tauri. As operações reutilizam a pasta existente de cada perfil e os seletores nativos de importação e exportação. A janela também permite copiar pastas e arquivos, mover itens para a lixeira do perfil e restaurá-los em **Meus arquivos**.

## Fase 4

A distribuição desktop prevê AppImage e DEB no Linux, MSI ou EXE no Windows e DMG no macOS.

O **Mini Navegador** abre em **Iniciar → Internet**. O instalador Linux x86-64 inclui seu build Electron. A interface do navegador usa uma origem interna e uma ponte IPC própria, e as abas externas usam uma sessão Chromium separada, com sandbox e sem acesso ao Node.js ou à ponte IPC. Histórico, favoritos e sessão web são armazenados por perfil do EduOS.

O instalador inclui os builds originais de Notes, Email, Photo Studio, Video Studio, Audio Studio e Music Studio do HeyPuter Everything. O preparo busca uma revisão fixa, instala as dependências a partir dos lockfiles e compila os aplicativos. O Tauri incorpora os builds, os avisos de licença e o arquivo de código-fonte da revisão.

Cada app é servido por uma porta própria vinculada somente à interface de loopback. O Puter exige uma origem HTTP ou HTTPS para autenticação e acesso ao serviço. As janelas auxiliares podem abrir o login do Puter e ficam fora da capacidade da janela principal. O EduOS usa um armazenamento da webview por perfil e fecha as janelas Puter ao trocar de perfil. A política de conteúdo da área de trabalho continua a restringir conexões ao IPC local.

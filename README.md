# EduOS

O EduOS é um aplicativo de área de trabalho educacional para Linux, Windows e macOS. Reúne perfis locais de Administrador, Professor e Estudante, ferramentas escolares e uma Lojinha para descobrir aplicativos. A área de trabalho e os apps locais funcionam offline. Os serviços web, como a vitrine online e os apps do Puter, usam internet.

## Baixar

Baixe os instaladores no [Release de teste v0.1.0](https://github.com/zonaeducacional/EduOS/releases/tag/v0.1.0).

| Sistema | Arquivo |
| --- | --- |
| Linux x64 | `EduOS_0.1.0_amd64.deb` ou `EduOS_0.1.0_amd64.AppImage` |
| Windows x64 | `EduOS_0.1.0_x64-setup.exe` |
| macOS Apple Silicon | `EduOS_0.1.0_aarch64.dmg` |
| macOS Intel | `EduOS_0.1.0_x64.dmg` |

Os pacotes de Windows e macOS foram gerados no GitHub Actions. A instalação e a execução nesses sistemas ainda precisam de teste nativo. O [guia de instalação](docs/GUIA-DE-USO.md#instalação) explica como abrir cada pacote e verificar o download.

## O que você pode fazer

- Criar perfis locais e escolher quais apps integrados ficam disponíveis para Professor e Estudante.
- Usar a Biblioteca, a Calculadora, o Bloco de notas, o Escola Office, os jogos e o gerenciador Arquivos · VibeLab.
- Instalar pacotes locais `.eduos` assinados e, com acesso de Administrador, publicar pacotes para os perfis selecionados.
- Cadastrar e publicar cards de apps web em uma vitrine central. O serviço da vitrine está disponível no código e aguarda um endereço público no release de teste.

O Mini Navegador e a Gestão de Notas acompanham os instaladores Linux x64. O VibeLab Horário acompanha os instaladores Linux e Windows x64 do release.

## Documentação

- [Guia de uso e instalação](docs/GUIA-DE-USO.md)
- [Desenvolvimento e testes](docs/DESENVOLVIMENTO.md)
- [Compilação, instaladores e publicação](docs/DISTRIBUICAO.md)
- [Arquitetura](ARCHITECTURE.md)
- [Administração da vitrine online](apps/lojinha-web/README.md)
- [Formato dos pacotes .eduos](packages/eduos-package/FORMAT.md) e [SDK](packages/eduos-package/SDK.md)

## Licença

O código original do EduOS e da Lojinha online está sob a [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). Componentes incorporados, aplicativos independentes e recursos com termos próprios seguem seus respectivos avisos. Consulte o [registro de licenças e créditos](THIRD_PARTY_NOTICES.md).

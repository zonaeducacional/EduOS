# Compilação e distribuição

Execute os comandos a partir da raiz do repositório depois de instalar as [dependências de desenvolvimento](DESENVOLVIMENTO.md). Cada compilação de produção prepara a interface, os apps do Puter e os recursos nativos previstos para o sistema.

| Sistema host | Comando |
| --- | --- |
| Linux | `pnpm tauri build --bundles deb,appimage` |
| Windows | `pnpm tauri build --bundles nsis` |
| macOS | `pnpm tauri build --bundles dmg` |

Os instaladores ficam em `apps/desktop/src-tauri/target/release/bundle/`, ou no diretório de destino definido no Cargo. Com `--debug`, o caminho usa `debug` e o pacote pode ser maior.

## Apps nativos de fábrica

| Variável de ambiente | Arquivo de origem |
| --- | --- |
| `EDUOS_VIBELAB_HORARIO_APPIMAGE` | AppImage do VibeLab Horário 1.2.0 para Linux x64 |
| `EDUOS_GESTAO_NOTAS_APPIMAGE` | AppImage original de Gestão de Notas para Linux x64 |
| `EDUOS_VIBELAB_HORARIO_EXE` | Executável portátil original do VibeLab Horário 1.2.0 para Windows x64 |

Encontre os binários oficiais do Horário no [release do VibeLab Horário](https://github.com/zonaeducacional/horariolivre/releases/tag/v1.2.0). O empacotamento Linux também compila o Mini Navegador. O script aceita `EDUOS_ALLOW_MISSING_NATIVE_APPS=1` para gerar builds de teste com os binários de fábrica disponíveis.

## GitHub Actions

O fluxo manual [Instaladores de teste do EduOS](../.github/workflows/installers.yml) gera o Debian, o instalador Windows x64 e os DMGs para Apple Silicon e Intel. Baixe os artefatos do resultado da execução. O AppImage também pode ser montado no Linux usando o comando da tabela.

Os segredos `EDUOS_VIBELAB_HORARIO_APPIMAGE_URL`, `EDUOS_VIBELAB_HORARIO_EXE_URL` e `EDUOS_GESTAO_NOTAS_APPIMAGE_URL` recebem as URLs HTTPS dos binários originais. Para Gestão de Notas, configure também a variável `EDUOS_GESTAO_NOTAS_APPIMAGE_SHA256`. O fluxo confere o hash antes de incorporar cada arquivo.

Antes de publicar um release de distribuição, teste a instalação em cada sistema e configure a [assinatura do Windows](https://v2.tauri.app/distribute/sign/windows/) e a [assinatura e notarização do macOS](https://v2.tauri.app/distribute/sign/macos/). Gere e publique o SHA-256 de cada instalador junto com os arquivos.

## Vitrine central

Hospede o [serviço da Lojinha](../apps/lojinha-web/README.md) em HTTPS. Defina `VITE_EDUOS_WEB_STORE_URL` ao compilar localmente e a variável de repositório `EDUOS_WEB_STORE_URL` para o GitHub Actions. Use a mesma origem pública em todos os instaladores para que todos consultem o mesmo catálogo.

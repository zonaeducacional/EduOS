# Guia de uso do EduOS

## Instalação

Baixe o instalador e o arquivo de checksum do seu sistema na [página do release](https://github.com/zonaeducacional/EduOS/releases/tag/v0.1.0).

- **Linux com Debian ou Ubuntu.** Abra o `.deb` no instalador de pacotes do sistema. Também é possível executar `sudo apt install ./EduOS_0.1.0_amd64.deb` na pasta do download.
- **Linux com AppImage.** Na pasta do download, execute `chmod +x EduOS_0.1.0_amd64.AppImage` e depois `./EduOS_0.1.0_amd64.AppImage`.
- **Windows x64.** Abra o arquivo `EduOS_0.1.0_x64-setup.exe` e siga o instalador.
- **macOS.** Abra o `.dmg` da sua arquitetura e arraste o EduOS para **Aplicativos**.

Para verificar o arquivo, compare o SHA-256 com o valor publicado no release. Use `sha256sum ARQUIVO` no Linux, `shasum -a 256 ARQUIVO` no macOS ou `Get-FileHash ARQUIVO -Algorithm SHA256` no PowerShell, substituindo `ARQUIVO` pelo nome baixado. Os pacotes de Windows e macOS são versões de teste cuja assinatura para distribuição ainda está pendente.

## Primeira execução e perfis

Crie o perfil de Administrador e defina sua senha local. Em **Gerenciar perfis**, crie perfis de Professor ou Estudante e selecione os aplicativos liberados para cada função. Use o menu **Iniciar** para encontrar apps por nome ou categoria.

Em **Aparência**, ajuste o tema e o papel de parede do perfil atual. O EduOS guarda as preferências e anotações neste computador.

## Lojinha e Estúdio

- **Pacotes locais.** Use **Lojinha** na dock para ver os pacotes publicados para seu perfil. Confira as permissões exibidas antes de instalar ou atualizar.
- **Estúdio.** Entre como Administrador e abra **Gerenciar perfis → Estúdio e Lojinha** para assinar, autorizar chaves e publicar pacotes locais. A chave do Estúdio usa senha própria. O [exemplo da calculadora](../examples/calculadora/README.md) descreve o fluxo.
- **Vitrine online.** Se a instalação tiver um endereço configurado, abra **Lojinha → Vitrine online**. O botão **Abrir** de cada card leva ao app web. Para administrar o catálogo, use **Administrar Lojinha** no rodapé e entre com a conta de publicação. Você pode editar a prévia, salvar um rascunho, publicar ou ocultar um card. Veja a [configuração do serviço](../apps/lojinha-web/README.md).

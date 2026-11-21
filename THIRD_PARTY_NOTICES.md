# Licenças e créditos

O [LICENSE](LICENSE) contém a GNU Affero General Public License v3. O código original do EduOS e da Lojinha online é disponibilizado sob a versão 3 da licença (`AGPL-3.0-only`). Os avisos específicos dos arquivos e dos componentes incorporados indicam os termos aplicáveis a eles.

## Componentes com licença identificada

| Componente | Licença e fonte |
| --- | --- |
| Escola Office | MIT. O aviso original atribui o copyright aos colaboradores do Meridian Office. [Texto da licença](apps/desktop/public/escola-office/LICENSE) |
| Solucionador do VibeLab Horário | MIT. [Aviso original do código incorporado](apps/desktop/src/builtins/horario/LICENSE) |
| VibeLab Horário 1.2.0 | MIT no projeto original. [Código e licença](https://github.com/zonaeducacional/horariolivre/tree/v1.2.0) |
| HeyPuter Notes, Email, Photo Studio, Video Studio e Audio Studio | AGPL-3.0-only. [Revisão usada no build](https://github.com/HeyPuter/everything/tree/01fa74d865e348532779263303186436eb99cd1a) |
| HeyPuter Music Studio | MIT. [Revisão usada no build](https://github.com/HeyPuter/everything/tree/01fa74d865e348532779263303186436eb99cd1a) |
| Electron e Chromium | O Electron usa MIT e o Chromium reúne componentes com licenças próprias. O pacote do Mini Navegador inclui os avisos da distribuição. [Licença do Electron](https://github.com/electron/electron/blob/main/LICENSE) |

O [script de build do Puter](scripts/build-puter-apps.mjs) registra a revisão exata, copia os avisos das dependências de produção e empacota os fontes selecionados em `puter/codigo-fonte.tar.gz`.

## Componentes com termos a confirmar

A licença do código do EduOS cobre as contribuições originais do projeto. Os builds ou recursos originais de Gestão de Notas, Arquivos · VibeLab, Biblioteca, Jogo dos Pontinhos, Quadro Magnético de Poesia e outros recursos visuais incorporados exigem a confirmação dos termos de suas respectivas origens. A presença desses arquivos em um instalador indica sua inclusão técnica. Consulte o titular ou mantenedor original para obter os termos aplicáveis de reutilização e redistribuição.

As dependências gerenciadas por npm, pnpm e Cargo têm licenças próprias. Consulte os avisos distribuídos e os metadados das versões registradas nos lockfiles.

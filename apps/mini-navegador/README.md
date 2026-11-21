# Mini Navegador

Navegador simples em Electron: abas, barra de endereço com pesquisa, favoritos, histórico, zoom e atalhos.

## Como rodar

Precisa do [Node.js](https://nodejs.org) instalado.

```bash
npm install
npm start
```

## Gerar instalador

```bash
npm run build
```

No Linux, o resultado fica em `dist/linux-unpacked/`. O instalador do EduOS inclui esse diretório e inicia o executável diretamente para manter o sandbox do Chromium. O projeto também define alvos de empacotamento para Windows e macOS.

## Atalhos

| Atalho | Ação |
|---|---|
| Ctrl+T | Nova aba |
| Ctrl+W | Fechar aba |
| Ctrl+Tab / Ctrl+Shift+Tab | Próxima / aba anterior |
| Ctrl+L | Focar a barra de endereço |
| Ctrl+R | Recarregar (ou parar) |
| Alt+← / Alt+→ | Voltar / avançar |
| Ctrl+D | Favoritar a página |
| Ctrl+H | Abrir o histórico |
| Ctrl++ / Ctrl+- / Ctrl+0 | Zoom |
| F12 | Ferramentas de desenvolvedor |

Clique do meio na aba fecha. Botão direito num favorito remove.

## Estrutura

- `main.js` — processo principal: janela, abas (cada aba é uma `WebContentsView`), menu e dados
- `preload.js` — ponte segura entre a interface e o processo principal
- `index.html`, `styles.css`, `renderer.js` — interface (barra de abas, endereço e favoritos)
- `newtab.html` — página inicial de cada aba nova

Favoritos e histórico ficam em `data.json` na pasta de dados do app.

## Ideias para a próxima etapa

- Barra de progresso de carregamento
- Bloqueio de anúncios por lista de domínios (`session.webRequest.onBeforeRequest`)
- Página de downloads (`session.on('will-download')`)
- Reabrir aba fechada (Ctrl+Shift+T)
- Busca na página (`webContents.findInPage`)
- Restaurar abas ao reabrir o navegador

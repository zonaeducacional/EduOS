# Desenvolvimento e testes

Use Node.js 22.12+ na linha 22 ou Node.js 24+, pnpm 10.32.1 e Rust estável. Para executar o desktop nativo, instale as [dependências do Tauri 2 do seu sistema](https://v2.tauri.app/start/prerequisites/).

Execute os comandos da raiz do repositório.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

O Vite serve a interface em `http://127.0.0.1:1420`. Para usar os recursos do sistema operacional, execute `pnpm tauri dev`. Execute `pnpm build:factory` antes do modo nativo se precisar preparar os recursos externos, como os apps do Puter e o Mini Navegador no Linux. Consulte o [guia de distribuição](DISTRIBUICAO.md) para configurar os apps nativos de fábrica.

O Mini Navegador Electron em `apps/mini-navegador` usa seu próprio `package-lock.json`. O script de empacotamento usa `npm ci` nesse diretório.

## Estrutura

| Caminho | Conteúdo |
| --- | --- |
| `apps/desktop` | Interface Svelte e host nativo Tauri |
| `apps/lojinha-web` | Vitrine e painel administrativo do catálogo central |
| `apps/mini-navegador` | Navegador Electron empacotado no Linux x64 |
| `packages/desktop-core` | Regras de desktop e janelas |
| `packages/eduos-package` | Validação, assinatura e formato de pacotes |
| `packages/eduos-store` | Catálogo local e persistência SQLite |
| `examples/calculadora` | App de exemplo em WebAssembly e pacotes de demonstração |

## Verificações

```sh
pnpm lint
pnpm svelte-check
pnpm test
cargo test --locked --manifest-path packages/eduos-package/Cargo.toml
cargo test --locked --manifest-path packages/eduos-store/Cargo.toml
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Use o [roteiro de aceite](../AGENTS.md) para validar perfis, funcionamento offline e instalação de pacotes. A [arquitetura](../ARCHITECTURE.md) explica os limites entre a interface, os apps e o armazenamento.

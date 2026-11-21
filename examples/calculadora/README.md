# Calculadora da SDK

O diretório `pacote/` está pronto para importar no Estúdio. Ele contém o manifesto, o ícone e o módulo WebAssembly. Em **Gerenciar perfis → Estúdio e Lojinha**, importe a pasta, assine e salve o `.eduos`. Na Lojinha, adicione a chave do Estúdio às chaves confiáveis, abra o pacote e escolha os perfis. Você pode confirmar a instalação administrativa ou publicá-lo na vitrine para um perfil instalar.

No perfil escolhido, abra **Iniciar → Educação → Calculadora da SDK**. Digite 6 e 7 e clique em **Multiplicar**. A tela mostra 42. Para habilitar **Copiar resultado**, conceda a permissão de escrita na área de transferência ao revisar o pacote.

Para recompilar o recurso após editar o código:

```sh
rustup target add wasm32-unknown-unknown
cargo build --locked --release --target wasm32-unknown-unknown --manifest-path examples/calculadora/Cargo.toml
cp examples/calculadora/target/wasm32-unknown-unknown/release/calculadora_eduos.wasm examples/calculadora/pacote/calculadora.wasm
```

Incremente a versão do manifesto antes de assinar uma atualização. Use a mesma chave de assinatura.

O diretório `demonstracao/` contém as duas versões assinadas no teste offline em Linux e a chave pública correspondente. Para repetir o teste com os mesmos bytes em outro sistema, adicione `calculadora-demonstracao.eduospub` em **Lojinha → Adicionar chave pública**, instale 1.0.0, atualize para 1.1.0 e reverta. A chave pública da demonstração requer aprovação explícita na Lojinha.

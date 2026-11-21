# Lojinha online do EduOS

A vitrine é pública. O link **Administrar Lojinha**, no rodapé, abre o painel protegido. Use o painel para editar os cards, salvar rascunhos, publicar e ocultar aplicativos. Mudanças aparecem quando a vitrine é reaberta ou recarregada.

## Publicação

Execute `node apps/lojinha-web/server.mjs` com Node.js 22 ou 24. Configure as variáveis abaixo no servidor, usando o gerenciador de segredos para a senha.

| Variável | Valor |
| --- | --- |
| `LOJINHA_ORIGIN` | Origem pública HTTPS da vitrine, sem caminho. Para teste local, o padrão é `http://127.0.0.1:4310`. |
| `LOJINHA_ADMIN_LOGIN` | Login da pessoa responsável pela publicação. |
| `LOJINHA_ADMIN_PASSWORD` | Senha da conta de publicação, com pelo menos 14 caracteres. |
| `LOJINHA_DATA` | Caminho do catálogo JSON em um volume persistente. O padrão é `lojinha-data.json` no diretório de execução. |
| `HOST`, `PORT` | Endereço e porta do processo. Por padrão, o serviço escuta em `127.0.0.1:4310`. |

Execute uma instância do serviço atrás de um proxy HTTPS. Mantenha uma cópia do arquivo de catálogo. Reiniciar o serviço encerra as sessões de administração.

Defina `VITE_EDUOS_WEB_STORE_URL` com a URL da vitrine ao compilar o EduOS. Use a mesma URL em todos os instaladores. Na compilação local de depuração, use `http://127.0.0.1:4310` para testar o fluxo no seu computador.

## Código-fonte da instância

A Lojinha online usa a [AGPL-3.0-only](../../LICENSE). Ao disponibilizar uma versão modificada pela rede, ofereça aos usuários acesso ao código-fonte correspondente à versão em uso. O rodapé da página é um local para colocar esse link.

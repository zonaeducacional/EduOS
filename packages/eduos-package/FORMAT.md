# Pacote .eduos v1

A extensão identifica um contêiner binário de recursos locais. Os inteiros usam ordem little-endian. A tabela usa caminhos ASCII relativos e ordenados por byte. O campo `category` é opcional. Os demais campos do manifesto são obrigatórios.

| Ordem | Campo | Representação |
| --- | --- | --- |
| 1 | Identificador e versão | 8 bytes `45 44 55 4f 53 00 01 0a` |
| 2 | Identificador da chave | 32 bytes, SHA-256 da chave pública Ed25519 bruta |
| 3 | Manifesto | Comprimento `u32` e bytes JSON em UTF-8 |
| 4 | Número de recursos | `u16` |
| 5 | Recursos | Para cada recurso, comprimento do caminho `u16`, caminho, comprimento do conteúdo `u32` e conteúdo |
| 6 | Assinatura | 64 bytes Ed25519 sobre todos os bytes anteriores, a partir do identificador do formato |

O pacote aceita até 64 MiB no total, um manifesto de até 32 KiB, até 1.024 recursos e até 16 MiB por recurso. Cada caminho tem até 240 bytes. Cada segmento aceita letras ASCII, dígitos, ponto, sublinhado e hífen. Barras separam segmentos. Segmentos vazios, ponto no começo ou no fim, nomes reservados do Windows e colisões entre arquivos e diretórios ou entre grafias que diferem apenas na caixa são rejeitados.

## Manifesto

```json
{
  "id": "br.eduos.calculadora",
  "name": "Calculadora",
  "version": "1.0.0",
  "entry": "calculadora.wasm",
  "profiles": ["teacher", "student"],
  "permissions": ["clipboard_write"],
  "icon": "assets/icon.png",
  "category": "education",
  "window": { "width": 400, "height": 500 }
}
```

O ID usa domínio reverso com segmentos em minúsculas. `version` usa SemVer. Os perfis elegíveis são `administrator`, `teacher` e `student`. A lista de perfis precisa conter pelo menos um item. A lista de permissões pode estar vazia. Ela aceita `file_read`, `file_write`, `clipboard_read`, `clipboard_write` e `notifications`. As listas rejeitam repetições. A entrada e o ícone devem existir como recursos distintos. A extensão do ícone pode ser PNG, JPEG, JPG ou WebP. A largura inicial vai de 300 a 4.096 e a altura de 235 a 4.096.

## Validação e confiança

O Estúdio usa `Manifest::from_json` para validar a definição importada e `sign_package` para gerar o contêiner. A Lojinha usa `verify_package` com as chaves públicas aprovadas pelo administrador. O pacote leva apenas o identificador da chave. O hospedeiro fornece as chaves confiáveis por um canal local próprio. O retorno da biblioteca é um manifesto e vistas dos recursos em memória. Decodificar ícones, decidir permissões, instalar arquivos e executar a entrada são responsabilidades do hospedeiro.

O menu aceita `development`, `education`, `office`, `graphics`, `internet`, `media`, `system` e `utilities` em `category`. O padrão é `utilities`. A execução usa os módulos WebAssembly da [SDK EduOS](SDK.md).

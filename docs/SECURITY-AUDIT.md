# Auditoria local de configuração e segredos — 09/09/2026

Escopo: arquivos do projeto (incluindo legados e `.env.local`), configuração local do Git
e todos os commits alcançáveis pelas referências locais. A primeira execução analisou
36 commits e 54 blobs históricos únicos. Não foram consultados reflogs/objetos
inalcançáveis, serviços remotos, conteúdo de dependências ou credenciais do sistema.

O script `yarn audit:secrets` procura chaves públicas Google/Firebase, private keys,
JSON de service account, tokens GitHub/Slack/cloud, JWTs, URLs com credenciais e
atribuições suspeitas de senha/token/segredo. Só imprime local, linha e categoria.
É uma busca por padrões, não uma garantia de ausência de qualquer segredo possível.

## Resultado

- `script.js:2` e `regulagem.js:2`, inclusive versões no histórico: configuração pública
  do Firebase Web SDK. A mesma configuração pública foi colocada no `.env.local`
  ignorado. Esses valores não concedem poderes administrativos.
- `lib/firebase.ts`: configuração real removida da aplicação nova; agora usa referências
  explícitas a `NEXT_PUBLIC_FIREBASE_*`. `.env.example` contém somente nomes vazios.
- Nenhuma senha, chave privada, service account, token administrativo ou outra
  credencial privada foi encontrada pelos padrões da auditoria.
- Nenhuma credencial identificada exige rotação como segredo administrativo. A chave
  pública Web não precisa ser rotacionada apenas por aparecer no cliente ou no histórico.
  Restrições de API/quotas podem ser revisadas no Console, mantendo Auth e Firestore funcionando.
- A vulnerabilidade relevante era a regra global temporária: antes de 22/07/2026 ela
  permitia operações públicas; após expirar passou a negar acessos. Sua substituição
  por autorização explícita é necessária. Esta auditoria não determina se houve
  acesso indevido à base durante o período de abertura.

`.gitignore` ignora `.env*`, exceto `.env.example`, além de `.vercel/` e logs de depuração.
Os legados permanecem intactos; nenhum histórico foi reescrito. O projeto não utiliza
Firebase Admin SDK, senhas no código ou segredos administrativos em variáveis públicas.

Firebase CLI foi adicionado apenas para testes locais. Sua instalação emitiu avisos
de dependências transitivas depreciadas. ESLint 9 também está fora de suporte, mas é
a versão compatível com os plugins React da configuração Next atual. Esses avisos
devem ser acompanhados; não são evidência de vazamento de credenciais.

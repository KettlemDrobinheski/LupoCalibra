# Ativação manual — Authentication e Firestore

Esta preparação não publica regras, cria usuários, altera documentos existentes ou faz deploy.
A regra temporária anterior expirou em 22/07/2026. O login foi confirmado pelo usuário;
publique a versão atual de `firestore.rules` para habilitar também o reset do OPERADOR.

## Política preparada

| Recurso | ADMIN ativo | OPERADOR ativo |
| --- | --- | --- |
| Painel e regulagem | Acesso | Acesso de leitura |
| `configuracoes_cubas` | Ler; criar/atualizar as 16 BLs canônicas | Ler |
| `producao_diaria/linha_export` | Ler; gravar status validado | Ler; reset atômico para OPERACIONAL |
| `estado_sistema/geral` | Ler; executar reset validado | Ler; reset atômico com UID e horário |
| `historico_paradas` | Ler; criar parada; atualizar somente duração | Sem acesso |
| `acessos/{próprio UID}` | Ler próprio perfil | Ler próprio perfil |
| Criar/editar perfis pelo aplicativo | Proibido | Proibido |
| Excluir qualquer documento | Proibido | Proibido |

Usuários sem perfil, inativos ou com perfil inválido não acessam os dados operacionais.
Criar uma conta no Authentication não concede autorização. O OPERADOR ativo recebe
permissão específica de reset, validada nas regras. Regulagem, criação de paradas e
alteração de perfis continuam bloqueadas para esse perfil.

## Passos no Console, nesta ordem

1. Abra o projeto existente no [Console Firebase](https://console.firebase.google.com/).
   Confirme o projeto comparando os campos com a configuração pública do aplicativo
   Web em Configurações do projeto. Não crie um novo banco para esta migração.
2. Entre em **Authentication → Sign-in method / Método de login**. Ative somente
   **Email/Password / E-mail e senha** e salve. O método de link por e-mail não é utilizado.
3. Em **Authentication → Users / Usuários → Add user / Adicionar usuário**, crie o primeiro
   usuário com o identificador interno da matrícula (`001234@lupocalibra.invalid`, por exemplo)
   e senha forte, conforme [LOGIN-MATRICULA.md](LOGIN-MATRICULA.md). Não salve a senha em arquivos do projeto e não a
   envie no chat. Copie o **UID** que o Firebase gerou.
4. Em **Firestore Database → Data / Dados**, crie a coleção **`acessos`**, se ainda não
   existir. Crie um documento cujo ID seja exatamente o UID copiado, sem usar ID automático.
   Se já existir um documento com esse UID, revise-o antes de qualquer alteração.
   Para o primeiro administrador, adicione:

   | Campo | Tipo no Console | Valor |
   | --- | --- | --- |
   | `role` | string | `ADMIN` |
   | `active` | boolean | `true` |

   O `true` deve ser booleano, não texto. Não armazene senha ou tokens nesse documento.
   Esta etapa exige a conta administrativa do Console/IAM; o aplicativo não pode
   promover ninguém a ADMIN. Ela funciona mesmo com as regras de cliente expiradas,
   porque o Console usa suas permissões administrativas.
5. Revise integralmente [firestore.rules](../firestore.rules) com a tabela acima.
   Em **Firestore Database → Rules / Regras**, substitua o conteúdo anterior pelo
   arquivo inteiro, sem delimitadores Markdown. Revise e **publique manualmente**.
   Não mantenha outra regra abrangente de acesso público. Publicar regras não altera
   ou apaga documentos existentes.
6. Em **Authentication → Settings / Configurações → Authorized domains / Domínios autorizados**,
   confira `localhost` para os testes locais. Ele pode não estar incluído automaticamente
   em projetos recentes. Quando houver um domínio Vercel/produção definido, cadastre
   o hostname exato usado pela aplicação, sem protocolo ou caminho. Revise também os
   domínios utilizados em fluxos de e-mail/autorização antes de publicar a aplicação.
7. No computador, confira `.env.local` com os valores públicos do mesmo aplicativo Web.
   O arquivo já foi preparado a partir do legado, sem alterar valores. Pare e reinicie
   seu `yarn dev` para recarregar as variáveis; abra `/login`.
8. Entre com o primeiro ADMIN e confira as 16 BLs, a leitura das regulagens, os botões
   administrativos e o logout. **Após autenticar um ADMIN, a simulação pode gravar
   paradas no projeto real.** Para não produzir registros de teste na base operacional,
   faça essa homologação em projeto Firebase separado ou no emulador antes de usar a base real.
9. Para um OPERADOR, crie outro usuário em Authentication e outro `acessos/{UID}` com
   `role` string `OPERADOR` e `active` boolean `true`. Confira a leitura do painel e
   regulagem, com reset confirmado no servidor, sem edição de regulagens ou simulação. Um usuário sem documento em `acessos`
   deve receber a mensagem de falta de autorização.

## Revogação e sessões

Para revogar acesso, altere manualmente `active` para `false` no perfil; não é necessário
apagar o usuário nem seus dados. As regras consultam esse perfil no servidor para
autorizar cada operação. O aplicativo observa o perfil e desmonta o painel quando
o acesso é revogado. Nenhum perfil pode ser alterado pelo SDK cliente, mesmo por ADMIN.

A persistência do login é limitada à sessão da aba (`browserSessionPersistence`):
recarregar a página mantém a sessão; sair ou fechar a sessão da aba encerra o uso.
Senhas ficam somente no formulário durante o envio e não são gravadas pelo aplicativo.
Dados operacionais e funções de escrita são liberados apenas após confirmação de
autenticação e perfil. Cache local de perfil sozinho não concede autorização.
O documento do próprio perfil é a única leitura permitida antes da autorização operacional.

A proteção das páginas é do cliente: respostas HTML sem sessão mostram apenas o estado
de carregamento, e o navegador redireciona para `/login`. Não há cookie administrativo,
Firebase Admin SDK ou conteúdo privado renderizado no servidor. A fronteira de
segurança dos dados são as regras Firestore, que também bloqueiam chamadas diretas.

## Testar regras sem tocar no projeto real

Ferramentas de desenvolvimento: `firebase-tools` e `@firebase/rules-unit-testing`, fixadas
no Yarn. O emulador exige Java 21 disponível no PATH do processo. Não é necessário
fazer login no Firebase CLI.

```powershell
yarn test:rules:emulator
```

O comando usa explicitamente o projeto fictício `demo-lupocalibra-tests` e Firestore
em `127.0.0.1:8080`. Os testes recusam um host que não seja loopback. Fixtures e limpeza
ocorrem somente nessa base emulada. O emulador é encerrado ao final. O primeiro uso
pode baixar o runtime oficial. Na preparação foi usado um Java portátil temporário,
com SHA-256 verificado, sem alterar Java ou PATH global.

Os testes cobrem não autenticados, usuários sem perfil, inativos, ADMIN/OPERADOR,
escalada de perfil, 16 IDs, valores inválidos, preservação de campos legados, reset em
lote e exclusões proibidas. Não execute comandos `deploy` durante esta revisão.

Referências: [login por senha](https://firebase.google.com/docs/auth/web/password-auth),
[regras por campos](https://firebase.google.com/docs/firestore/security/rules-fields),
[testes com emulador](https://firebase.google.com/docs/rules/unit-tests),
[domínios locais](https://firebase.google.com/docs/auth/faq-and-troubleshooting).

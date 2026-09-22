# LupoCalibra

Aplicação Next.js App Router e TypeScript na branch `main`, com Firebase
Authentication com entrada por matrícula/senha e autorização por perfil. A publicação das regras é manual.

O cadastro inicial por matrícula está descrito em [LOGIN-MATRICULA.md](docs/LOGIN-MATRICULA.md).
O provedor Firebase continua sendo Email/Password, com identificador interno por matrícula.
Contas antigas por e-mail precisam ser adaptadas pelo responsável preservando o UID.

## Executar localmente

Ambiente validado: Node 22.23.2 e Yarn **1.22.22**, fixado em `packageManager` e `engines`.
Preserve `yarn.lock` e utilize um único gerenciador.

```powershell
yarn install --frozen-lockfile
# Se .env.local ainda não existir, copie .env.example e preencha os valores públicos.
yarn dev
```

Abra `http://localhost:3000/login`. O painel `/` e a regulagem `/regulagem` exigem
usuário autenticado com perfil ativo. A configuração Firebase local já foi copiada
com segurança do legado para `.env.local`; esse arquivo está ignorado pelo Git.

**Antes do primeiro login, siga [a ativação manual no Firebase](docs/FIREBASE-SETUP.md).**
A regra temporária expirou em 22/07/2026. O usuário confirmou o login com o perfil
OPERADOR após a configuração no Console. A nova versão de `firestore.rules` precisa
ser publicada para liberar o reset ao OPERADOR; regras antigas rejeitam essa operação.

## Autenticação e autorização

A sessão usa `onAuthStateChanged` e persistência por sessão da aba. Só depois de
conhecer o usuário o aplicativo consulta seu documento `acessos/{uid}`. Só após
confirmar um perfil ativo no servidor são montados o painel e os listeners operacionais.

- `ADMIN`: leitura, regulagem, reset e simulação com registro de paradas.
- `OPERADOR`: leitura das regulagens e do último status salvo, com reset autorizado.
- Conta sem perfil, perfil inativo ou desconhecido: sem acesso operacional.
- Nenhum usuário do aplicativo, inclusive ADMIN, pode criar/alterar perfis ou excluir documentos.

A interface reflete as permissões; **as regras Firestore aplicam os bloqueios no servidor**.
Perfis são administrados manualmente pelo Console/IAM. Gerenciamento de operadores
pela aplicação fica para uma etapa futura. Login inválido, carregamento, falta de
permissão e logout têm estados próprios. Não existe cadastro público no aplicativo.

## Publicação no GitHub Pages

Site: [LupoCalibra](https://kettlemdrobinheski.github.io/LupoCalibra/).

O workflow `.github/workflows/pages.yml` compila e publica a aplicação a cada push
na `main`. O Pages deve usar a origem **GitHub Actions**, pois a publicação direta
da raiz da branch exibiria o `index.html` legado, sem o login novo.

No build de publicação, `GITHUB_PAGES=true` ativa a exportação estática em `out/`,
o prefixo `/LupoCalibra` e as páginas com barra final. O desenvolvimento local
continua usando os caminhos originais, sem esse prefixo.

As variáveis Firebase abaixo devem existir em **Settings → Secrets and variables →
Actions → Variables** do repositório. Somente a configuração pública do SDK Web
é usada; `.env.local` não é enviado. Para acessar o painel publicado, é necessária
uma conta com perfil ativo. A publicação não cria contas nem libera acesso anônimo.

## Variáveis públicas

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Obrigatória: configuração do SDK Web/Auth |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Obrigatória: domínio da configuração Web |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Obrigatória: projeto do Firestore |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Obrigatória: identidade do aplicativo Web |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Opcional: Storage não é utilizado |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Opcional: Messaging não é utilizado |

Use os valores do aplicativo Web existente no Console, sem colá-los em arquivos
versionados. Analytics não é utilizado, portanto não há variável de measurement ID.
A API key do SDK Web é configuração pública, não uma chave administrativa. Nunca
coloque private key, service account, senha ou token administrativo em `NEXT_PUBLIC_*`.
Este projeto não precisa de credenciais Firebase Admin no servidor.

Para o deploy futuro, selecione o framework **Next.js**, Node **22.x**, instalação
`yarn install --frozen-lockfile` e build `yarn build`. Cadastre as quatro variáveis
obrigatórias em **Vercel → Project Settings → Environment Variables**, nos ambientes
que serão utilizados. As duas opcionais podem ser cadastradas se necessário.
As variáveis `NEXT_PUBLIC_*` entram no bundle durante o build; alterações exigem
novo build. O prebuild valida os nomes obrigatórios sem imprimir valores.

Antes de usar o domínio definitivo, revise os domínios autorizados em Firebase
Authentication. Para previews/homologação, prefira um projeto Firebase separado:
um ADMIN autorizado em preview também poderia gravar na base configurada.
Nenhum CLI Vercel, login, vínculo de repositório ou deploy foi executado.

Referências: [variáveis Next.js](https://nextjs.org/docs/app/guides/environment-variables)
e [Next.js na Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs).

## Operação e dados preservados

As 16 BLs, lados e faixas originais estão centralizados em `lib/bins.ts`. Os caminhos
`configuracoes_cubas/{id}`, `producao_diaria/linha_export`, `historico_paradas/{id}` e
`estado_sistema/geral` foram preservados; `acessos/{uid}` é a nova fonte de autorização.
Gravações usam merge, e as regras impedem a alteração de campos legados desconhecidos.

O ADMIN mantém a simulação: intervalo de 342 ms, peças de 150 a 400 g e chance de
desvio para uma cuba fora da faixa de 2%. A quinta peça fora do peso na mesma cuba,
nos últimos 120 segundos (limite inclusivo), bloqueia a linha e identifica BL/lado.
Falhas antigas expiram e peças corretas não apagam falhas recentes. O travamento
aleatório foi removido. Reset preserva contagens de peças na faixa, limpa a janela de
falhas e aguarda confirmação da transação Firestore. O estado salvo só é exibido
após confirmação do servidor, sem antecipar gravações locais pendentes.
No reset do ADMIN, a duração da parada local é atualizada sem reescrever motivo/tipo/horário.
O reset do OPERADOR não altera o histórico de paradas; registra o último executor e
horário em `estado_sistema/geral`. Veja [RESET-OPERADOR.md](docs/RESET-OPERADOR.md).
A navegação mantém o estado; recarregar a página ou trocar sessão reinicia contagens locais.

O OPERADOR não simula nem grava automaticamente. Visualiza as faixas das 16 BLs e
consulta o último `statusGeral` salvo. Contagens/pesos individuais aparecem como `---`,
pois não são persistidos pelo esquema atual. Isso evita exibir zeros locais como dados reais.
A sincronização desses contadores e a eleição de um único simulador são pendências.
Um ADMIN aberto observa novos identificadores de reset do servidor e limpa seu estado
local. Paradas pendentes de uma geração anterior de reset não sobrescrevem a nova geração.

Regulagens válidas aplicam peso alvo ± tolerância à visualização e à classificação.
Tolerância zero é aceita. Sem documento, usam-se as faixas originais. Em sobreposições,
vence a última BL correspondente do lado, como antes; lacunas deixam a peça sem classificação.
Os IDs legados `1_L` a `8_L`/`1_R` a `8_R` permanecem legíveis, mas não são remapeados
ou gravados automaticamente. Confirme sua correspondência antes de migrar dados.

`index.html`, `regulagem.html`, `script.js` e `regulagem.js` continuam como referências legadas.
O Next reutiliza o CSS, mas não carrega os scripts legados, que permanecem referências
históricas com os bugs antigos e não fazem parte do lint da aplicação nova.

## Verificações

```powershell
yarn lint
yarn typecheck
yarn test
yarn test:auth:emulator
yarn test:rules:emulator
yarn audit:secrets
yarn build
```

`yarn test` preserva os nove testes operacionais e adiciona testes de sessão/permissões.
O login por matrícula acrescenta validação de formato e preservação de zeros iniciais:
19 testes locais passaram, além de lint, TypeScript e build. `test:auth:emulator`
verifica a autenticação por matrícula no emulador Auth local, sem depender de Java.
`test:rules:emulator` exige Java 21 no PATH, inicia somente Firestore local no projeto
fictício `demo-lupocalibra-tests`, testa chamadas diretas às regras e encerra o emulador.
Nenhum dos testes escreve no projeto real nem exige login de conta real.

Verificação desta etapa: lint, TypeScript, 17 testes locais (incluindo os nove
originais), seis testes de regras no emulador e build de produção passaram. As
quatro variáveis obrigatórias foram confirmadas no bundle cliente sem exibir valores.
As rotas `/login`, `/` e `/regulagem` responderam HTTP 200; sem sessão, as páginas
protegidas renderizam somente a verificação de sessão, sem cartões operacionais.
As 16 BLs foram verificadas no catálogo e nos testes de escrita autorizada do emulador.
O navegador automatizado não estava disponível para conferir a interface visual.

A [auditoria de segredos](docs/SECURITY-AUDIT.md) cobre arquivos locais e histórico
alcançável, sem imprimir valores. Não encontrou segredos privados pelos padrões utilizados.
Somente a configuração pública Firebase aparece nos legados/histórico e no ambiente ignorado.

Pendências: publicação das regras atualizadas de reset e homologação da operação real,
revisão visual no navegador e confirmação dos IDs legados. A aplicação continua sendo
uma simulação, sem integração com balanças/PLC.

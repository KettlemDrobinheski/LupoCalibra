# LupoCalibra

O LupoCalibra nasceu da minha experiência em produção industrial. Usei o processo de classificação por peso em uma linha de embalagem como ponto de partida para construir um painel que mostra como regulagens, desvios de peso e bloqueios afetam a operação.

O projeto é um **protótipo de simulação**, sem integração com balanças, sensores, esteiras ou controladores industriais reais.

## Experimente a demonstração

Na tela de login, clique em **Explorar demonstração**. A demonstração abre sem matrícula ou senha, com dados fictícios independentes em cada aba. Você pode iniciar, pausar, retomar, ajustar as balanças, demonstrar um bloqueio e executar o reset. O estado fica em memória durante a navegação entre o painel e a regulagem. Recarregar a página reinicia a sessão da demo.

Enquanto a publicação estiver pendente, use a demonstração local em `http://localhost:3000/demo`. O caminho previsto no GitHub Pages é `/LupoCalibra/demo/`, com a central de regulagem em `/LupoCalibra/demo/regulagem/`.

## Como a simulação funciona

- **Vazão.** São 16 cubas, oito por lado. Em operação contínua, cada cuba recebe 120 peças por minuto, totalizando 1.920 na linha. Um agendador distribui as chegadas das peças. A retomada descarta as chegadas do período em que a simulação ficou parada.
- **Classificação.** Cada peça recebe um peso individual. A faixa de cada balança é definida pelo peso-alvo e pela tolerância percentual. O contador de peças na faixa sobe apenas quando o peso é aprovado.
- **Faixas padrão.** As classes `BL_06` a `BL_12` cobrem 160–180, 181–200, 201–220, 221–240, 241–260, 261–280 e 281–300 g. A faixa padrão temporária da `BL_200UP` é 301–999 g.
- **Bloqueio.** Cinco peças fora da faixa na mesma cuba em até dois minutos bloqueiam a linha. Na demo, **Demonstrar bloqueio** injeta essas cinco peças fictícias. No modo autenticado, a chance de desvio é de 2% por oportunidade a cada 342 ms na linha inteira, independente da vazão de cada cuba.
- **Reset.** Limpa o bloqueio e a janela de falhas, preserva as regulagens e as contagens de peças aprovadas e aguarda um novo comando de início ou retomada.

A vazão é nominal e depende da execução regular do temporizador do navegador. Quando o navegador suspende o temporizador, a simulação descarta as chegadas perdidas.

## Modo autenticado

O login usa matrícula e senha pelo Firebase Authentication. O Firestore confirma o perfil ativo em `acessos/{uid}` antes de liberar a área operacional.

| Perfil | Permissão |
| --- | --- |
| **OPERADOR** | Iniciar, parar e retomar a simulação, editar regulagens, inicializar a linha e executar o reset. |
| **ADMIN** | Consultar o status da linha e as regulagens. |

Uma transação no Firestore reserva a linha para uma única sessão, inclusive quando duas abas usam a mesma matrícula. A autorização vence após 30 segundos e a aba ativa tenta renová-la a cada 10 segundos. Bloqueio remoto confirmado, perda de confirmação da conexão ou expiração interrompem a geração.

O Firestore guarda as regulagens, o status compartilhado, os registros de parada e o último reset. Pesos e contagens individuais ficam na aba. A demonstração pública funciona em memória, sem leitura ou gravação no Firebase. [Login por matrícula](docs/LOGIN-MATRICULA.md) · [Fluxo de reset](docs/RESET-OPERADOR.md)

## Tecnologias e aprendizados

| Tecnologia | Uso |
| --- | --- |
| Next.js App Router, React e TypeScript | Rotas públicas e protegidas, interface compartilhada e tipos para balanças, amostras e estado da linha. |
| Firebase Authentication e Cloud Firestore | Identidade, permissões, atualizações em tempo real e transações para coordenar sessões. |
| Node.js, ESLint e Firebase Emulator Suite | Testes do motor, da concorrência, do login e das regras. |
| GitHub Actions e GitHub Pages | Build e hospedagem da exportação estática. |

Os principais aprendizados foram separar a regra de classificação da interface, usar o mesmo motor com dados locais ou persistidos, coordenar abas concorrentes com transações e proteger as operações nas regras do Firestore. Testes com relógio controlado permitem conferir um minuto de produção sem a espera real.

## Execute localmente

Use Node.js 22 e Yarn Classic 1.22.22.

```powershell
yarn install --frozen-lockfile
# Se ainda não existir, copie .env.example para .env.local e preencha os valores públicos.
yarn dev
```

Abra `http://localhost:3000/demo` ou use **Explorar demonstração** em `/login`. As rotas `/` e `/regulagem` exigem uma conta com perfil ativo. [Configuração do Firebase](docs/FIREBASE-SETUP.md)

| Variável pública do SDK Web | Necessidade |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Obrigatória |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Obrigatória |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Obrigatória |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Obrigatória |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Opcional |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Opcional |

O build conjunto exige as quatro variáveis obrigatórias para incluir o modo autenticado. A execução da demonstração no navegador funciona sem o Firebase. Use apenas os valores públicos da configuração do SDK Web em `NEXT_PUBLIC_*`. Mantenha credenciais administrativas fora do repositório e dessas variáveis.

## Verificações

```powershell
yarn test
yarn test:rules:emulator
yarn test:auth:emulator
yarn typecheck
yarn lint
$env:GITHUB_PAGES = 'true'
yarn build
```

Na validação pré-publicação, passaram **40 testes locais**, **11 testes das regras do Firestore** e **1 teste de login por matrícula**. TypeScript, ESLint e o build estático de produção também passaram. Os testes das regras exigem Java 21 no PATH. Os emuladores usam o projeto fictício `demo-lupocalibra-tests`.

## Publicação no GitHub Pages

O [workflow](.github/workflows/pages.yml) exporta o site para `out/` com o prefixo `/LupoCalibra`. No GitHub, a origem do Pages deve ser **GitHub Actions**. Configure as quatro variáveis obrigatórias do SDK Web em **Settings → Secrets and variables → Actions → Variables** e confira se elas apontam para o Firebase que será usado pelo modo autenticado.

O workflow pode publicar a cada push na `main`. Antes de liberar a nova versão, compare as regras ativas com `firestore.rules` e guarde a versão ativa para reversão. Se a comparação indicar que é preciso atualizá-las, aguarde a propagação das regras compatíveis antes de liberar o site. Para reverter, recupere uma combinação compatível de site e regras. A publicação das regras é uma operação separada do GitHub Pages.

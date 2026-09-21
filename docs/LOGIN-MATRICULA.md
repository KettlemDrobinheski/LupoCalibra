# Login por matrícula

A tela `/login` aceita matrícula numérica (1 a 32 dígitos) e senha individual.
Zeros iniciais fazem parte da matrícula: `001234` e `1234` são contas diferentes.
Espaços nas extremidades são removidos; letras, espaços internos e separadores são rejeitados.

## Cadastro inicial pelo responsável

O Firebase continua usando o provedor Email/Password. A aplicação converte a matrícula
em um identificador interno, sem consultar uma lista pública de funcionários:
`001234` corresponde exatamente a `001234@lupocalibra.invalid`.
Esse endereço não é uma caixa de e-mail e não recebe mensagens.

1. No projeto correto, habilite Email/Password em Firebase Authentication.
2. Em Authentication → Users → Add user, cadastre o endereço interno calculado acima
   e a senha individual definida por canal privado. Não coloque senhas no repositório ou chat.
3. Copie o UID da conta. Em Firestore, crie `acessos/{UID}` com `role` igual a
   `ADMIN` ou `OPERADOR` e `active` booleano igual a `true`.
4. Confira as regras publicadas conforme [FIREBASE-SETUP.md](FIREBASE-SETUP.md).
   Uma conta sem perfil ativo deve continuar sem acesso operacional.
5. Na aplicação, entre apenas com a matrícula e a senha. Confira a matrícula exibida,
   o perfil autorizado, a rejeição de senha incorreta e o encerramento da sessão por “Sair”.

Não há cadastro público nem gestão de funcionários dentro da aplicação nesta etapa.
Apenas criar uma conta no Authentication não concede autorização no Firestore.
Mantenha política de senha e proteção contra enumeração configuradas no Authentication.

## Contas existentes e recuperação

Contas já criadas com e-mail pessoal/corporativo não são localizadas pelo novo login.
Um administrador de confiança deve atualizar o e-mail da conta para o identificador
interno usando ferramentas administrativas do Firebase, preservando o UID e o perfil.
Não exclua/recrie usuários para migrar; confira primeiro que a matrícula está correta
e não pertence a outra conta. Nenhuma migração ou criação real é feita automaticamente.

Recuperação é assistida pelo responsável, após conferir a identidade do funcionário.
Não envie links de redefinição/verificação aos endereços `.invalid`, pois não recebem e-mail.
Troca obrigatória de senha no primeiro acesso e tela administrativa de cadastro ainda
não foram implementadas. Não trate uma senha compartilhada como solução definitiva.

## Verificação isolada

`yarn test` cobre validação, zeros iniciais, mensagens genéricas e autorização por perfil.
`yarn test:auth:emulator` inicia somente o emulador Auth local, sem Java, no projeto
fictício `demo-lupocalibra-tests`. Cria uma conta descartável com senha aleatória e
verifica login, identidade, logout, senha incorreta e matrícula inexistente. Não usa
`.env.local`, credenciais reais ou o banco operacional.

A homologação real exige Auth habilitado, conta e perfil cadastrados e regras publicadas.
Use homologação separada: o ADMIN ainda inicia uma simulação que pode gravar paradas.
Troca de responsável preservando produção e auditoria de ações são etapas separadas;
o login atual não estabelece exclusividade de comando da máquina.

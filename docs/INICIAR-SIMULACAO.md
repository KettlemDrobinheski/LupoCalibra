# Etapa: iniciar simulação pelo operador

Ao abrir ou reconectar o painel, a geração de peças aguarda o botão **Iniciar
simulação**. A espera aparece em amarelo. Após o comando, a simulação aparece em
verde. O botão exige OPERADOR ativo, regulagens válidas carregadas e status salvo
OPERACIONAL. Um bloqueio salvo exige reset antes de iniciar.

O comando é local à aba e não grava um novo estado de operação no Firebase nesta
etapa. Contagens continuam locais. Recarregar a página exige iniciar novamente.

Parar e Retomar serão implementados nas próximas etapas. O reset de uma simulação
já iniciada ainda mantém o comportamento anterior de retomada automática.

Esta etapa substitui a descrição anterior de início automático no README.

Validação: testes da aplicação, lint e build estático. Não houve publicação das
alterações nem mudança nas regras Firestore nesta etapa.

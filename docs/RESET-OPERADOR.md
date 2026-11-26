# Inicialização, reset e bloqueio por peso

O OPERADOR pode inicializar e resetar a linha. O ADMIN consulta o status e as
regulagens. Quando o status estiver ausente ou inválido, o painel apresenta
**Inicializar linha**. Quando houver um bloqueio confirmado, use **Reset**.

O reset grava `producao_diaria/linha_export` e `estado_sistema/geral` em uma
transação. Preserva campos legados, limpa o motivo da parada, encerra a autorização
de simulação e grava o UID do operador, o horário do servidor e um novo marcador
de reset. Se a aba atual tiver registrado a parada que ainda está ativa, a
transação finaliza também a duração desse evento.

Uma solicitação baseada em um status ou uma autorização que já mudou é
rejeitada. Aguarde o painel sincronizar e confira o estado antes de tentar
novamente. A interface aguarda o Firestore confirmar o status. O reset limpa
a janela de falhas, preserva as contagens locais de peças na faixa e exige
um novo comando para iniciar.

## Conferência em homologação

1. Abra a linha em duas sessões autenticadas como OPERADOR e acione **Iniciar
   simulação** nas duas. Confira que só uma começa a contar peças.
2. Ao registrar cinco peças fora da faixa na mesma cuba em até 120 segundos,
   confira o bloqueio e o motivo nas duas sessões.
3. Execute **Reset**. Confira que o alerta desaparece após a confirmação e que
   a geração de peças aguarda o próximo comando de início.
4. Entre como ADMIN e confirme que o status e as regulagens aparecem para
   consulta. Em seguida, confirme que um perfil inativo perde o acesso.

A aplicação é uma simulação. Contagens e janelas de erros ficam na aba.
O fluxo depende das regras do Firestore correspondentes à versão do painel.

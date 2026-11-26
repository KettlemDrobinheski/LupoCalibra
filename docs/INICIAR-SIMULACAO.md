# Etapa: iniciar simulação pelo operador

Ao abrir ou reconectar o painel, a geração de peças aguarda o botão **Iniciar
simulação**. A espera aparece em amarelo. Após o comando, a simulação aparece em
verde. O botão exige OPERADOR ativo, regulagens válidas carregadas e status salvo
OPERACIONAL. Um bloqueio salvo exige reset antes de iniciar.

O início reserva no Firestore a autorização para uma aba. A autorização dura 30
segundos e a aba tenta renová-la a cada 10 segundos. As contagens ficam na aba.
Recarregar a página exige iniciar novamente e aguardar a liberação ou expiração
da autorização anterior, se ainda estiver ativa.

O botão **Parar** pausa a geração de peças nesta aba, preservando pesos, contagens,
regulagens e falhas recentes. O botão de início passa a **Retomar simulação**.
Pausar não limpa um bloqueio e não substitui o reset. A janela de falhas continua
usando o tempo decorrido: falhas com mais de dois minutos expiram ao retomar.
A pausa libera a autorização, permitindo que outra aba inicie a simulação.

Bloqueios confirmados, perda de confirmação da conexão e expiração da autorização
interrompem a geração de peças. O reset confirmado libera a autorização anterior.
Para voltar a gerar peças, clique novamente em **Iniciar simulação** ou **Retomar
simulação**.

Esta etapa substitui a descrição anterior de início automático no README.

Este fluxo exige as regras do Firestore correspondentes à versão do painel.

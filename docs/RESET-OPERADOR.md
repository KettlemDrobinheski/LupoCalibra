# Reset do OPERADOR e bloqueio por peso

## Comportamento

ADMIN e OPERADOR ativos podem executar reset. O aplicativo impede duplo acionamento
local e só confirma sucesso depois da transação no servidor. Sem conexão ou com
permissão negada, mantém o alerta e informa a falha. Atualizações locais ainda não
confirmadas pelo Firestore não apagam o status da tela.

O reset escreve em conjunto `producao_diaria/linha_export` e `estado_sistema/geral`,
preservando campos legados por merge. Limpa JAMMED/BLOQUEADO e o motivo exibido,
grava `resetPor` com o UID autenticado, `resetEm` com horário do servidor e um novo
`resetToken` compartilhado pelos dois documentos. Essas informações representam
o último reset, não uma trilha de auditoria imutável de todos os resets.

As regras exigem que o OPERADOR atualize os dois documentos na mesma operação, com
status OPERACIONAL, alertas desligados e seu próprio UID. Não permitem alterar
regulagens, criar paradas, editar históricos ou perfis, nem apagar documentos.

## Nova condição de parada

Cada cuba mantém os horários de suas próprias peças fora da faixa configurada.
Na quinta ocorrência dentro de 120 segundos, incluindo o limite exato, a simulação
bloqueia e registra BL, lado, último peso e faixa esperada. Peças corretas não zeram
o contador; ocorrências mais antigas que 120 segundos saem da janela. O reset limpa
essa janela e preserva a contagem de peças dentro da faixa.

Os eventos podem informar `binId`, que representa a cuba que realmente recebeu a peça.
A simulação do ADMIN continua usando peças de 150 a 400 g e desvio incorreto em 2%
das amostras. Não há mais JAM aleatório no temporizador. O estado JAMMED legado
continua legível e pode ser resetado. `motivoParada` permite ao OPERADOR identificar
a cuba em novas paradas, sem acesso à coleção de históricos.

Um ADMIN já aberto acompanha o marcador de reset para zerar suas falhas locais.
Transações de parada conferem a geração de reset para não gravar uma parada antiga
depois de um reset mais recente.

## Ativação e conferência

1. Copie o arquivo inteiro `firestore.rules` para Firestore → Regras e publique.
2. Recarregue a aplicação atualizada e entre como OPERADOR, sem promover a ADMIN.
3. Execute Reset e confirme: durante a operação o alerta anterior permanece; após
   confirmação, o status fica OPERACIONAL em verde e o motivo da parada desaparece.
4. Confirme que regulagens continuam sem edição e que um perfil inativo perde acesso.
5. Em homologação, gere cinco peças fora da faixa na mesma cuba em até 120 segundos.
   Confira o bloqueio e a identificação da BL/lado no painel do OPERADOR.

## Limites atuais

Validação local desta alteração: 26 testes de lógica/autorização, oito testes das
regras no emulador Firestore, lint, TypeScript e build de produção passaram. Nenhuma
regra foi publicada e nenhum dado do projeto real foi alterado por esses testes.

Não há integração com balanças/PLC. O OPERADOR não produz amostras nem simula sozinho;
novas falhas dependem do simulador ADMIN ou de uma futura fonte de dados real.
Contagens e janelas de erros continuam locais ao simulador e reiniciam ao recarregar
ou trocar sessão. A coordenação de vários simuladores e a persistência dessas
janelas são trabalhos separados. O reset remoto do OPERADOR preserva o histórico,
mas não fecha a duração de uma parada histórica que ele não tem acesso para editar.

'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { BINS, SIDES, weightRange } from '../lib/bins';
import { MAX_ALLOWED_ERRORS } from '../lib/system';
import { useSystem } from './system-provider';

const formatWeight = (weight: number) => `${Number(weight.toFixed(2))}g`;

type Props = {
  operator: boolean;
  allowReset: boolean;
  sessionActions?: ReactNode;
  demonstration?: { block: () => void; reset: () => Promise<void> };
};

export function Dashboard({ operator, allowReset, sessionActions, demonstration }: Props) {
  const { simulationStarted, simulationPaused, acquiring, beginSimulation, pauseSimulation, system, configs, resetting, configReady, configError, configWarning, syncError, connectionError, reset, reconnect, productionReady, productionStatus, productionReason } = useSystem();
  const regulationPath = demonstration ? '/demo/regulagem' : '/regulagem';
  const canPause = simulationStarted && !resetting && system.phase === 'running';
  const savedAlarm = productionStatus === 'JAMMED' || productionStatus === 'BLOQUEADO';
  const needsInitialization = productionReady && productionStatus === 'SEM REGISTRO VÁLIDO';
  const status = resetting ? 'RESET EM ANDAMENTO'
    : savedAlarm ? `BLOQUEIO SALVO: ${productionStatus}`
    : !productionReady ? demonstration ? 'PREPARANDO DEMONSTRAÇÃO' : 'AGUARDANDO CONFIRMAÇÃO DO FIRESTORE'
    : needsInitialization ? 'LINHA SEM STATUS VÁLIDO — INICIALIZE PARA COMEÇAR'
    : system.phase === 'jammed' ? 'ESTEIRA TRAVADA'
    : system.phase === 'interlocked' ? 'EMERGÊNCIA — LINHA BLOQUEADA'
    : simulationPaused ? 'SIMULAÇÃO PAUSADA'
    : !configReady ? 'SIMULAÇÃO PAUSADA — AGUARDANDO REGULAGENS' : !simulationStarted ? 'AGUARDANDO COMANDO DE INÍCIO' : 'SIMULAÇÃO EM OPERAÇÃO';
  return <>
    <header><div className="ihm-container">
      <div className="ihm-header-alinhado">
        <div><h1>LINHA DE EMBALAGEM BL EXPORT</h1><p className="subtitle">Sistema de Integridade do Desviador de Alta Velocidade</p><p className={demonstration ? 'demo-label' : 'subtitle'}>{demonstration ? 'Demonstração — dados simulados' : operator ? 'Simulação operacional' : 'Acompanhamento da produção — somente consulta'}</p></div>
        <Link className="btn-setup-geral" href={regulationPath} aria-label="Abrir central de regulagem">⚙️</Link>
        {operator && <button className="btn-reset" disabled={acquiring || simulationStarted || resetting || !productionReady || !configReady || system.phase !== 'running' || (!demonstration && productionStatus !== 'OPERACIONAL')} onClick={beginSimulation}>{acquiring ? 'Reservando simulação…' : canPause ? 'Simulação iniciada' : simulationPaused ? 'Retomar simulação' : 'Iniciar simulação'}</button>}
        {operator && <button className="btn-reset" disabled={!canPause} onClick={pauseSimulation}>{demonstration ? 'Pausar' : 'Parar'}</button>}
        {demonstration && <button className="btn-reset" disabled={!canPause} onClick={demonstration.block}>Demonstrar bloqueio</button>}
        {allowReset && <button className="btn-reset" disabled={resetting || acquiring || !productionReady} onClick={() => {
          if (demonstration) { void demonstration.reset(); return; }
          if (window.confirm(needsInitialization ? 'Inicializar o status compartilhado da linha?' : 'Resetar os alertas e interromper a simulação ativa? As contagens locais serão preservadas.')) void reset();
        }}>{resetting ? 'Aguarde…' : needsInitialization ? 'Inicializar linha' : '🔄 Reset'}</button>}
      </div>
      {sessionActions}
      <div className={`system-status ${savedAlarm ? 'status-stopped' : resetting || !productionReady || needsInitialization || (operator && !configReady) ? 'status-pending' : !operator || (simulationStarted && system.phase === 'running') ? 'status-running' : system.phase === 'running' ? 'status-ready' : 'status-stopped'}`} role="status">{operator ? status : `${productionReady ? 'ÚLTIMO STATUS SALVO' : 'SEM CONFIRMAÇÃO DO SERVIDOR'}: ${productionStatus ?? 'AGUARDANDO DADOS'}`}</div>
      {!operator && <p className="subtitle">ADMIN pode consultar status e regulagens. O OPERADOR executa a simulação, altera regulagens e realiza o reset.</p>}
      {demonstration ? <p className="subtitle">Inicie a simulação e use “Demonstrar bloqueio” para atingir o limite de cinco peças fora da faixa na mesma balança. Use o reset para liberar a linha.</p>
        : operator && !simulationStarted && <p className="subtitle">A simulação aguarda seu comando. Se houver um bloqueio salvo, execute o reset antes de iniciar.</p>}
      {system.stop && <p role="alert">{system.stop.reason}</p>}
      {system.stop && <p>Tempo parado: {system.downtimeSeconds}s</p>}
      {savedAlarm && productionReason && productionReason !== system.stop?.reason && <p className="notice-error" role="alert">{productionReason}</p>}
      {configError && <p className="notice-error" role="alert">{configError} <button onClick={reconnect}>Tentar novamente</button></p>}
      {configWarning && <p className="notice-warning" role="status">{configWarning}</p>}
      {syncError && <p className="notice-error" role="alert">{syncError}</p>}
      {connectionError && <p className="notice-warning" role="status">{connectionError} <button onClick={reconnect}>Reconectar</button></p>}
    </div></header>
    <main className="grid-container">
      {SIDES.map(side => <Fragment key={side.code}>
        <h2 className={`side-heading side-${side.code}`}>{side.heading}</h2>
        {BINS.filter(bin => bin.side === side.code).map(bin => {
          const live = system.bins[bin.id];
          const range = weightRange(bin, configs[bin.id]);
          const blocked = live.errors >= MAX_ALLOWED_ERRORS;
          return <article key={bin.id} className={`bin-card${blocked ? ' bin-error' : ''}`}>
            <div className={`bin-header border-${bin.side}`}><div><span className="bin-name">{bin.label}</span><small className="bin-side">Lado {bin.sideName}</small></div>
              <Link className="btn-regular-cuba" href={{ pathname: regulationPath, query: { cuba: bin.id } }} aria-label={`${operator ? 'Regular' : 'Consultar'} ${bin.label} lado ${bin.sideName}`}>⚙️</Link></div>
            <div className="bin-body">
              <p><strong>Faixa Alvo:</strong><span>{`${formatWeight(range.min)} – ${formatWeight(range.max)}`}</span></p>
              <p><strong>Último Peso:</strong><span className="weight-value">{operator && live.lastWeight ? formatWeight(live.lastWeight) : '---'}</span></p>
              <p><strong>Peças na faixa:</strong><span>{operator ? `${live.totalProcessed} un` : '---'}</span></p>
              <p><strong>Fora do peso (2 min):</strong><span className="error-count">{operator ? `${live.errors} / ${MAX_ALLOWED_ERRORS}` : '---'}</span></p>
              <p><strong>Status:</strong><span className="status-text">{operator ? blocked ? 'BLOQUEADO' : 'Operacional' : 'Consulta'}</span></p>
            </div>
          </article>;
        })}
      </Fragment>)}
    </main>
  </>;
}

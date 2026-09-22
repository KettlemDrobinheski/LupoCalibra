'use client';

import Link from 'next/link';
import { Fragment } from 'react';
import { BINS, SIDES, weightRange } from '../../lib/bins';
import { MAX_ALLOWED_ERRORS } from '../../lib/system';
import { useSystem } from '../../components/system-provider';
import { SessionActions } from '../../components/session-actions';
import { useAuth } from '../../components/auth-provider';
import { canOperate, canReset } from '../../lib/access';

const formatWeight = (weight: number) => `${Number(weight.toFixed(2))}g`;

export default function Dashboard() {
  const { session } = useAuth();
  const operator = canOperate(session);
  const { simulationStarted, beginSimulation, system, configs, resetting, configReady, configError, configWarning, syncError, reset, reconnect, productionStatus, productionReason } = useSystem();
  const savedAlarm = !simulationStarted && (productionStatus === 'JAMMED' || productionStatus === 'BLOQUEADO');
  const status = resetting ? 'RESET EM ANDAMENTO'
    : savedAlarm ? `BLOQUEIO SALVO: ${productionStatus} - EXECUTE O RESET`
    : system.phase === 'jammed' ? `ESTEIRA TRAVADA — TEMPO PARADO: ${system.downtimeSeconds}s`
    : system.phase === 'interlocked' ? `EMERGÊNCIA — LINHA BLOQUEADA — ${system.downtimeSeconds}s`
    : !configReady ? 'SIMULAÇÃO PAUSADA — AGUARDANDO REGULAGENS' : !simulationStarted ? 'AGUARDANDO COMANDO DO OPERADOR' : 'SIMULAÇÃO EM OPERAÇÃO';
  return <>
    <header><div className="ihm-container">
      <div className="ihm-header-alinhado">
        <div><h1>LINHA DE EMBALAGEM BL EXPORT</h1><p className="subtitle">Sistema de Integridade do Desviador de Alta Velocidade</p><p className="subtitle">{operator ? 'Simulação operacional' : 'Acompanhamento da produção — reset autorizado'}</p></div>
        <Link className="btn-setup-geral" href="/regulagem" aria-label="Abrir central de regulagem">⚙️</Link>
        {operator && <button className="btn-reset" disabled={simulationStarted || resetting || !configReady || system.phase !== 'running' || productionStatus !== 'OPERACIONAL'} onClick={beginSimulation}>{simulationStarted ? 'Simulação iniciada' : 'Iniciar simulação'}</button>}
        <button className="btn-reset" disabled={resetting || !canReset(session)} onClick={() => {
          if (window.confirm('Deseja realmente resetar os estados e alertas do painel? As contagens serão preservadas.')) void reset();
        }}>{resetting ? 'Resetando…' : '🔄 Reset'}</button>
      </div>
      <SessionActions />
      <div className={`system-status ${!operator ? productionStatus === 'OPERACIONAL' ? 'status-running' : productionStatus === 'JAMMED' ? 'status-jammed' : productionStatus === 'BLOQUEADO' ? 'status-stopped' : 'status-pending' : savedAlarm ? 'status-stopped' : resetting || !configReady ? 'status-pending' : system.phase === 'running' ? simulationStarted ? 'status-running' : 'status-ready' : system.phase === 'jammed' ? 'status-jammed' : 'status-stopped'}`} role="status">{operator ? status : `${resetting ? 'RESET EM ANDAMENTO — ' : ''}ÚLTIMO STATUS SALVO: ${productionStatus ?? 'AGUARDANDO DADOS'}`}</div>
      {!operator && <p className="subtitle">Você pode executar o reset. Contagens e pesos individuais não são armazenados pelo sistema atual. Regulagens e simulação continuam exclusivas do ADMIN.</p>}
      {operator && !simulationStarted && <p className="subtitle">A simulação aguarda seu comando. Se houver um bloqueio salvo, execute o reset antes de iniciar.</p>}
      {system.stop && <p role="alert">{system.stop.reason}</p>}
      {!operator && productionStatus !== 'OPERACIONAL' && productionReason && <p className="notice-error" role="alert">{productionReason}</p>}
      {configError && <p className="notice-error" role="alert">{configError} <button onClick={reconnect}>Tentar novamente</button></p>}
      {configWarning && <p className="notice-warning" role="status">{configWarning}</p>}
      {syncError && <p className="notice-error" role="alert">{syncError}</p>}
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
              <Link className="btn-regular-cuba" href={`/regulagem?cuba=${bin.id}`} aria-label={`Regular ${bin.label} lado ${bin.sideName}`}>⚙️</Link></div>
            <div className="bin-body">
              <p><strong>Faixa Alvo:</strong><span>{!configs[bin.id] && bin.code === '200UP' ? '> 300g' : `${formatWeight(range.min)} – ${formatWeight(range.max)}`}</span></p>
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

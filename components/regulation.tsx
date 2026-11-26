'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { BINS, SIDES, defaultConfig, isBinId, isValidConfig, weightRange, type BinConfig, type BinDefinition } from '../lib/bins';
import { useSystem } from './system-provider';

type Mode = { operator: boolean; demonstration?: boolean };

function RegulationForm({ bin, config, returnTo, operator, demonstration }: Mode & { bin: BinDefinition; config: BinConfig; returnTo?: string }) {
  const { saveConfig } = useSystem();
  const router = useRouter();
  const [weight, setWeight] = useState(String(config.pesoAlvo));
  const [tolerance, setTolerance] = useState(String(config.toleranciaPorcentagem));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const parsed = { pesoAlvo: Number(weight), toleranciaPorcentagem: Number(tolerance) };
  const valid = weight.trim() !== '' && tolerance.trim() !== '' && isValidConfig(parsed);
  const range = weightRange(bin, parsed);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !operator) return;
    if (!valid) { setMessage('Informe peso positivo e tolerância entre 0 e 100%.'); return; }
    setSaving(true);
    setMessage('');
    try {
      await saveConfig(bin.id, parsed);
      setMessage(demonstration ? 'Regulagem aplicada nesta aba.' : 'Configuração salva e aplicada ao painel.');
      if (returnTo) router.push(returnTo);
    } catch (error) { setMessage(`Não foi possível salvar: ${String(error)}`); }
    finally { setSaving(false); }
  }
  return <form onSubmit={submit}>
    <fieldset disabled={saving || !operator}>
      <div className="setup-campo"><label htmlFor="pesoAlvo">Peso Alvo da Peça (g):</label><input id="pesoAlvo" className="ihm-input" type="number" step="any" min="0.001" required value={weight} onChange={event => setWeight(event.target.value)} /></div>
      <div className="setup-campo"><label htmlFor="tolerancia">Tolerância Aceitável (%):</label><input id="tolerancia" className="ihm-input" type="number" step="any" min="0" max="100" required value={tolerance} onChange={event => setTolerance(event.target.value)} /></div>
      {valid && <p className="setup-subtitulo">Faixa resultante: {range.min.toFixed(2)}g – {range.max.toFixed(2)}g</p>}
      {operator && <button className="ihm-botao btn-bloco" type="submit">{saving ? 'Aplicando regulagem…' : demonstration ? 'Aplicar nesta aba' : '⚡ Aplicar e Salvar na Nuvem'}</button>}
    </fieldset>
    {message && <p role="status">{message}</p>}
    {!operator && <p role="status">Somente leitura. Alterações de regulagem são permitidas apenas para OPERADOR.</p>}
  </form>;
}

export function Regulation({ operator, demonstration, sessionActions }: Mode & { sessionActions?: ReactNode }) {
  const dashboardPath = demonstration ? '/demo' : '/';
  const regulationPath = demonstration ? '/demo/regulagem' : '/regulagem';
  const params = useSearchParams();
  const requestedId = params.get('cuba');
  const individual = params.get('modo') !== 'conjunto' && requestedId !== null;
  const [selected, setSelected] = useState(BINS[0].id);
  const id = individual ? requestedId : selected;
  const { configs, configLoaded, configError, configWarning, reconnect } = useSystem();
  const bin = id && isBinId(id) ? BINS.find(item => item.id === id) : undefined;
  return <main className="body-regulagem"><div className="setup-card">
    <h1 className="setup-titulo">⚙️ Central de Regulagem Geral</h1>
    {demonstration && <p className="demo-label">Demonstração — dados simulados</p>}
    {sessionActions}
    <p className="setup-subtitulo">Ajuste de parâmetros das Balanças (BLs)</p><hr className="setup-divisor" />
    {!individual && <div className="setup-campo"><label htmlFor="selecaoCuba">Selecione a Balança (BL) para Regular:</label><select id="selecaoCuba" className="select-industrial" value={selected} onChange={event => { if (isBinId(event.target.value)) setSelected(event.target.value); }}>
      {SIDES.map(side => <optgroup key={side.code} label={side.heading}>{BINS.filter(item => item.side === side.code).map(item => <option key={item.id} value={item.id}>{item.label} — {item.sideName}</option>)}</optgroup>)}
    </select></div>}
    {bin ? <>
      <p className="setup-subtitulo">Configurando: <strong className="selected-bin">{bin.label} — {bin.sideName}</strong></p>
      {configLoaded && <RegulationForm key={bin.id} bin={bin} config={configs[bin.id] ?? defaultConfig(bin)} operator={operator} demonstration={demonstration} returnTo={individual ? dashboardPath : undefined} />}
      {!configLoaded && !configError && <p role="status">Carregando configurações…</p>}
    </> : <p className="notice-error" role="alert">BL não reconhecida. Abra a central e selecione uma BL válida. <Link href={regulationPath}>Abrir central</Link></p>}
    {configError && <p className="notice-error" role="alert">{configError} <button onClick={reconnect}>Tentar novamente</button></p>}
    {configWarning && <p className="notice-warning">{configWarning}</p>}
    <Link href={dashboardPath} className="btn-voltar btn-bloco">⬅️ Voltar para o painel</Link>
  </div></main>;
}

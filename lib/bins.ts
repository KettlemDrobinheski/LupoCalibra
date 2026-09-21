export const SIDES = [
  { code: 'L', name: 'Esquerdo', heading: 'LADO ESQUERDO (Calha A)' },
  { code: 'R', name: 'Direito', heading: 'LADO DIREITO (Calha B)' },
] as const;

const CLASSES = [
  { code: '06', minWeight: 160, maxWeight: 180 },
  { code: '07', minWeight: 181, maxWeight: 200 },
  { code: '08', minWeight: 201, maxWeight: 220 },
  { code: '09', minWeight: 221, maxWeight: 240 },
  { code: '10', minWeight: 241, maxWeight: 260 },
  { code: '11', minWeight: 261, maxWeight: 280 },
  { code: '12', minWeight: 281, maxWeight: 300 },
  { code: '200UP', minWeight: 301, maxWeight: 999 },
] as const;

export type BinId = `BL_${typeof CLASSES[number]['code']}_${typeof SIDES[number]['code']}`;
export const BINS = SIDES.flatMap(side => CLASSES.map(bin => ({
  ...bin, id: `BL_${bin.code}_${side.code}` as BinId,
  label: `BL_${bin.code}`, side: side.code, sideName: side.name,
})));
export type BinDefinition = typeof BINS[number];
export type BinConfig = { pesoAlvo: number; toleranciaPorcentagem: number };
export type Configs = Partial<Record<BinId, BinConfig>>;

export function isBinId(id: string): id is BinId {
  return BINS.some(bin => bin.id === id);
}

export function isValidConfig(value: unknown): value is BinConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as BinConfig;
  return Number.isFinite(config.pesoAlvo) && config.pesoAlvo > 0
    && Number.isFinite(config.toleranciaPorcentagem)
    && config.toleranciaPorcentagem >= 0 && config.toleranciaPorcentagem <= 100;
}

export function weightRange(bin: BinDefinition, config?: BinConfig) {
  if (!config) return { min: bin.minWeight, max: bin.maxWeight };
  const margin = config.pesoAlvo * config.toleranciaPorcentagem / 100;
  return { min: config.pesoAlvo - margin, max: config.pesoAlvo + margin };
}

export function defaultConfig(bin: BinDefinition): BinConfig {
  const pesoAlvo = (bin.minWeight + bin.maxWeight) / 2;
  return { pesoAlvo, toleranciaPorcentagem: (bin.maxWeight - bin.minWeight) / (2 * pesoAlvo) * 100 };
}

export function readConfigs(documents: { id: string; data: unknown }[]) {
  const configs: Configs = {};
  const unknownIds: string[] = [];
  const invalidIds: string[] = [];
  for (const document of documents) {
    if (!isBinId(document.id)) unknownIds.push(document.id);
    else if (!isValidConfig(document.data)) invalidIds.push(document.id);
    else configs[document.id] = document.data;
  }
  return { configs, unknownIds, invalidIds };
}

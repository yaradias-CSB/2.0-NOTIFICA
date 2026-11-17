import * as XLSX from 'xlsx';
import { BarragemCanonica, EmpreendedorCanonico } from '../types/ecosystem';
import { resolveDecimalCoords } from './satelliteCaptureService';
import { normalizeCarCode, normalizeSearchText } from '../data/localAdministraRepository';
import { formatCpfCnpj, normalizeDocumentNumber } from '../lib/security';
import { authFetch } from '../lib/supabase';
import { OPS_MUNICIPIOS } from '../constants';

const PUBLIC_SEMA_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsNA_kn1hwAKLrBlErzLUV8yod3P_nRqHlzLHr6cWStOw8sEuodQTQLMycPfOQmA/pub?output=xlsx';
const PUBLIC_SNISB_CSV_URL =
  'https://docs.google.com/spreadsheets/d/18VwJZSAAsKU_qoJzAtxK3OxsyPNvkUD_rpZaZ1bdMnA/export?format=csv&gid=0';

export interface PublicCarFeature {
  codigoCar: string;
  statusCodigo: string;
  statusLabel: string;
  condicao: string;
  municipio: string;
  uf: string;
  codMunicipioIbge?: string;
  tipoImovelCodigo: string;
  tipoImovelLabel: string;
  areaHa: number;
  modulosFiscais: number;
  dataCriacao?: string;
}

export interface MatchedExistingCadastro {
  id: string;
  sourceLabel: string;
  empreendedorId?: string;
  barragemId?: string;
  empreendedorNome?: string;
  cpfCnpj?: string;
  carMt?: string;
  nomeBarragem?: string;
  codigoSnisb?: string;
  municipio?: string;
  usoPreponderante?: string;
  classificacaoDPA?: string;
  processo?: string;
  distanceKm?: number;
  empreendedorCanonico?: EmpreendedorCanonico;
  barragemCanonica?: BarragemCanonica;
}

export interface CoordinateLookupResult {
  online: boolean;
  decimalCoords: { lat: number; lng: number } | null;
  carFeatures: PublicCarFeature[];
  matchedCadastros: MatchedExistingCadastro[];
  error?: string;
}

interface SheetPublicRecord {
  empreendedor: string;
  cpfCnpj: string;
  propriedade: string;
  carMt: string;
  municipio: string;
  numNotificacao: string;
  lat: number;
  lng: number;
}

interface SnisbPublicRecord {
  snisb: string;
  nome: string;
  empreendedor: string;
  municipio: string;
  uso: string;
  dpa: string;
  lat: number;
  lng: number;
}

let cachedSheetRecords: SheetPublicRecord[] | null = null;
let cachedSnisbRecords: SnisbPublicRecord[] | null = null;

function fixText(str: string): string {
  if (!str) return '';
  return str
    .replace(/Ã¡/g, 'á')
    .replace(/Ã /g, 'à')
    .replace(/Ã¢/g, 'â')
    .replace(/Ã£/g, 'ã')
    .replace(/Ã©/g, 'é')
    .replace(/Ãª/g, 'ê')
    .replace(/Ã­/g, 'í')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã´/g, 'ô')
    .replace(/Ãµ/g, 'õ')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã§/g, 'ç')
    .replace(/Ã€/g, 'À')
    .replace(/Ã‚/g, 'Â')
    .replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‰/g, 'É')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ã‡/g, 'Ç')
    .trim();
}

export function matchMunicipioMT(raw?: string): string {
  if (!raw) return '';
  const norm = normalizeSearchText(raw);
  const found = OPS_MUNICIPIOS.find((m) => normalizeSearchText(m) === norm);
  return found || raw;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gmsObjectToDecimal(coords?: {
  lat: { g: string; m: string; s: string };
  long: { g: string; m: string; s: string };
}): { lat: number; lng: number } | null {
  if (!coords) return null;
  const latStr = `${coords.lat.g || '0'}°${coords.lat.m || '0'}'${coords.lat.s || '0'}"`;
  const lngStr = `${coords.long.g || '0'}°${coords.long.m || '0'}'${coords.long.s || '0'}"`;
  const resolved = resolveDecimalCoords(latStr, lngStr);
  if (!resolved.lat || !resolved.lng) return null;
  return resolved;
}

async function loadPublicSemaSheet(): Promise<SheetPublicRecord[]> {
  if (cachedSheetRecords) return cachedSheetRecords;
  try {
    const response = await fetch(PUBLIC_SEMA_SHEET_URL, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return [];
    const buf = await response.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const rows: SheetPublicRecord[] = [];

    wb.SheetNames.forEach((name) => {
      const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 'A' });
      json.slice(1).forEach((row) => {
        const empreendedor = fixText(String(row.D || ''));
        const cpfCnpj = fixText(String(row.C || ''));
        const propriedade = fixText(String(row.E || ''));
        const carMt = fixText(String(row.F || ''));
        const municipio = fixText(String(row.K || ''));
        const numNotificacao = fixText(String(row.B || ''));
        const coords = resolveDecimalCoords(String(row.I || ''), String(row.J || ''));
        if (!empreendedor && !carMt && !coords.lat) return;
        rows.push({
          empreendedor,
          cpfCnpj,
          propriedade,
          carMt,
          municipio,
          numNotificacao,
          lat: coords.lat,
          lng: coords.lng,
        });
      });
    });

    cachedSheetRecords = rows;
    return rows;
  } catch {
    return [];
  }
}

async function loadPublicSnisbCsv(): Promise<SnisbPublicRecord[]> {
  if (cachedSnisbRecords) return cachedSnisbRecords;
  try {
    const response = await fetch(PUBLIC_SNISB_CSV_URL, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) return [];
    const text = await response.text();
    const lines = text.split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map((h) => h.trim().toUpperCase());
    const idxSnisb = headers.findIndex((h) => h.includes('CÓDIGO SNISB'));
    const idxNome = headers.findIndex((h) => h.includes('NOME DA BARRAGEM'));
    const idxEmp = headers.findIndex((h) => h.includes('EMPREENDEDOR'));
    const idxMun = headers.findIndex((h) => h.includes('MUNICÍPIO'));
    const idxUso = headers.findIndex((h) => h.includes('USO PRINCIPAL'));
    const idxLat = headers.findIndex((h) => h.includes('LATITUDE'));
    const idxLng = headers.findIndex((h) => h.includes('LONGITUDE'));
    const idxDpa = headers.findIndex((h) => h.includes('DANO POTENCIAL'));

    const rows: SnisbPublicRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') inQuotes = !inQuotes;
        else if (ch === ',' && !inQuotes) {
          cols.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      cols.push(cur.trim());

      const latStr = idxLat >= 0 ? cols[idxLat] : '';
      const lngStr = idxLng >= 0 ? cols[idxLng] : '';
      const coords = resolveDecimalCoords(latStr || '', lngStr || '');
      if (!coords.lat || !coords.lng) continue;

      rows.push({
        snisb: idxSnisb >= 0 ? cols[idxSnisb] || '' : '',
        nome: idxNome >= 0 ? cols[idxNome] || '' : '',
        empreendedor: idxEmp >= 0 ? cols[idxEmp] || '' : '',
        municipio: idxMun >= 0 ? cols[idxMun] || '' : '',
        uso: idxUso >= 0 ? cols[idxUso] || '' : '',
        dpa: idxDpa >= 0 ? cols[idxDpa] || '' : '',
        lat: coords.lat,
        lng: coords.lng,
      });
    }

    cachedSnisbRecords = rows;
    return rows;
  } catch {
    return [];
  }
}

export async function lookupDataByCoordinates(params: {
  rawLat: string | number;
  rawLong: string | number;
  empreendedores: EmpreendedorCanonico[];
  barragens: BarragemCanonica[];
}): Promise<CoordinateLookupResult> {
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!online) {
    return {
      online: false,
      decimalCoords: null,
      carFeatures: [],
      matchedCadastros: [],
      error: 'Sem conexão com a internet no momento para consultar a base pública da SEMA/MT.',
    };
  }

  const decimal = resolveDecimalCoords(params.rawLat, params.rawLong);
  if (!decimal.lat || !decimal.lng) {
    return {
      online: true,
      decimalCoords: null,
      carFeatures: [],
      matchedCadastros: [],
      error: 'Informe Latitude e Longitude válidas antes de consultar a base pública.',
    };
  }

  let carFeatures: PublicCarFeature[] = [];
  let gisError: string | undefined;

  const [gisResponse, sheetRows, snisbRows] = await Promise.all([
    authFetch(`/api/gis/car-by-coords?lat=${encodeURIComponent(decimal.lat)}&lng=${encodeURIComponent(decimal.lng)}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok && json?.error) gisError = json.error;
        return json;
      })
      .catch(() => {
        gisError = 'Falha ao consultar o serviço georreferenciado público da SEMA/MT.';
        return null;
      }),
    loadPublicSemaSheet(),
    loadPublicSnisbCsv(),
  ]);

  if (gisResponse && Array.isArray(gisResponse.features)) {
    carFeatures = gisResponse.features;
  }

  const carCodesNorm = new Set(carFeatures.map((c) => normalizeCarCode(c.codigoCar)).filter(Boolean));
  const matchedCadastros: MatchedExistingCadastro[] = [];
  const dedup = new Set<string>();

  const pushCadastro = (item: MatchedExistingCadastro) => {
    const key = `${item.empreendedorId || ''}|${normalizeDocumentNumber(item.cpfCnpj || '')}|${normalizeCarCode(item.carMt)}|${normalizeSearchText(item.nomeBarragem)}|${item.codigoSnisb || ''}`;
    if (dedup.has(key)) return;
    dedup.add(key);
    matchedCadastros.push(item);
  };

  // 1. Cross-reference Administra Empreendedores by CAR/MT
  for (const emp of params.empreendedores) {
    const empCar = normalizeCarCode(emp.carMt);
    if (empCar && carCodesNorm.has(empCar)) {
      const linkedBar = params.barragens.find((b) => b.empreendedorId === emp.id);
      pushCadastro({
        id: `adm-emp-${emp.id}`,
        sourceLabel: 'Base Central Administra',
        empreendedorId: emp.id,
        barragemId: linkedBar?.id,
        empreendedorNome: emp.nome,
        cpfCnpj: emp.cpfCnpj,
        carMt: emp.carMt,
        nomeBarragem: linkedBar?.nomeBarragem,
        codigoSnisb: linkedBar?.codigoSnisb,
        municipio: emp.municipio || linkedBar?.municipio,
        empreendedorCanonico: emp,
        barragemCanonica: linkedBar,
      });
    }
  }

  // 2. Cross-reference Administra Barragens by coordinate proximity (<= 2 km)
  for (const bar of params.barragens) {
    const barCoords = gmsObjectToDecimal(bar.coordenadasGMS);
    if (!barCoords) continue;
    const dist = haversineKm(decimal.lat, decimal.lng, barCoords.lat, barCoords.lng);
    if (dist <= 2.0) {
      const linkedEmp = params.empreendedores.find((e) => e.id === bar.empreendedorId);
      pushCadastro({
        id: `adm-bar-${bar.id}`,
        sourceLabel: 'Base Central Administra',
        empreendedorId: linkedEmp?.id || bar.empreendedorId,
        barragemId: bar.id,
        empreendedorNome: linkedEmp?.nome || bar.empreendedorNome,
        cpfCnpj: linkedEmp?.cpfCnpj || bar.empreendedorCpfCnpj,
        carMt: linkedEmp?.carMt,
        nomeBarragem: bar.nomeBarragem,
        codigoSnisb: bar.codigoSnisb,
        municipio: bar.municipio || linkedEmp?.municipio,
        usoPreponderante: bar.usoPreponderante,
        classificacaoDPA: bar.classificacaoDPA,
        processo: bar.processoReferencia,
        distanceKm: Number(dist.toFixed(2)),
        empreendedorCanonico: linkedEmp,
        barragemCanonica: bar,
      });
    }
  }

  // 3. Cross-reference public SEMA/CSB historical sheet by CAR or coordinate proximity (<= 2 km)
  for (const row of sheetRows) {
    const rowCar = normalizeCarCode(row.carMt);
    const matchesCar = Boolean(rowCar && carCodesNorm.has(rowCar));
    const dist =
      row.lat && row.lng ? haversineKm(decimal.lat, decimal.lng, row.lat, row.lng) : Infinity;

    if (matchesCar || dist <= 2.0) {
      const digits = normalizeDocumentNumber(row.cpfCnpj);
      pushCadastro({
        id: `sema-sheet-${row.numNotificacao || row.carMt || row.empreendedor}`,
        sourceLabel: 'Base Histórica SEMA/MT',
        empreendedorNome: row.empreendedor,
        cpfCnpj: digits ? formatCpfCnpj(digits) : row.cpfCnpj,
        carMt: row.carMt || carFeatures[0]?.codigoCar,
        nomeBarragem: row.propriedade,
        municipio: matchMunicipioMT(row.municipio || carFeatures[0]?.municipio),
        processo: row.numNotificacao,
        distanceKm: Number.isFinite(dist) ? Number(dist.toFixed(2)) : undefined,
      });
    }
  }

  // 4. Cross-reference SNISB public dataset by coordinate proximity (<= 2 km)
  for (const sn of snisbRows) {
    const dist = haversineKm(decimal.lat, decimal.lng, sn.lat, sn.lng);
    if (dist <= 2.0) {
      pushCadastro({
        id: `snisb-${sn.snisb || sn.nome}`,
        sourceLabel: 'Base Pública SNISB',
        empreendedorNome: sn.empreendedor,
        nomeBarragem: sn.nome,
        codigoSnisb: sn.snisb,
        municipio: matchMunicipioMT(sn.municipio || carFeatures[0]?.municipio),
        usoPreponderante: sn.uso,
        classificacaoDPA: sn.dpa,
        carMt: carFeatures[0]?.codigoCar,
        distanceKm: Number(dist.toFixed(2)),
      });
    }
  }

  return {
    online: true,
    decimalCoords: decimal,
    carFeatures,
    matchedCadastros,
    error: carFeatures.length === 0 && matchedCadastros.length === 0 ? gisError : undefined,
  };
}

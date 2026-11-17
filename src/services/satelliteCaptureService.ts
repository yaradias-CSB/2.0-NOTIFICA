import { parseGMS, parseCoordinate, toGMS } from '../lib/coordinates';

export interface SatelliteFrameOptions {
  lat: string | number;
  long: string | number;
  damIndex: number;
  damName?: string;
  municipio?: string;
  zoom?: number;
  width?: number;
  height?: number;
}

export interface SatelliteFrameResult {
  dataUrl: string;
  width: number;
  height: number;
  latDecimal: number;
  longDecimal: number;
  latGMS: string;
  longGMS: string;
  scaleMeters: number;
  timestamp: string;
  error?: string;
}

/**
 * Converte latitude/longitude em graus decimais e força quadrante MT (Sul e Oeste)
 */
export const resolveDecimalCoords = (
  rawLat: string | number,
  rawLong: string | number
): { lat: number; lng: number } => {
  let lat = typeof rawLat === 'number' ? rawLat : parseGMS(rawLat);
  if (isNaN(lat) || lat === 0) {
    lat = parseCoordinate(String(rawLat), true);
  }

  let lng = typeof rawLong === 'number' ? rawLong : parseGMS(rawLong);
  if (isNaN(lng) || lng === 0) {
    lng = parseCoordinate(String(rawLong), false);
  }

  if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
    return { lat: 0, lng: 0 };
  }

  // Coordenadas em Mato Grosso são sempre Sul e Oeste (negativas)
  if (lat > 0) lat = -lat;
  if (lng > 0) lng = -lng;

  return { lat, lng };
};

/**
 * Carrega uma imagem de tile com suporte a CORS e timeout
 */
const loadTileImage = (url: string, timeoutMs = 4500): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let timer: any = null;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        img.src = '';
        reject(new Error(`Timeout ao carregar tile: ${url}`));
      }, timeoutMs);
    }

    img.onload = () => {
      if (timer) clearTimeout(timer);
      resolve(img);
    };

    img.onerror = (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    };

    img.src = url;
  });
};

/**
 * Desenha a rosa dos ventos / símbolo Norte cartográfico
 */
const drawNorthArrow = (ctx: CanvasRenderingContext2D, x: number, y: number, radius = 22) => {
  ctx.save();

  // Fundo circular translúcido
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.stroke();

  // Ponteiro Norte (metade vermelha, metade branca)
  const needleLength = radius * 0.75;
  const needleWidth = radius * 0.32;

  // Lado direito da agulha (Vermelho)
  ctx.beginPath();
  ctx.moveTo(x, y - needleLength);
  ctx.lineTo(x + needleWidth, y + 2);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = '#ef4444';
  ctx.fill();

  // Lado esquerdo da agulha (Branco)
  ctx.beginPath();
  ctx.moveTo(x, y - needleLength);
  ctx.lineTo(x - needleWidth, y + 2);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Cauda Sul (cinza escuro)
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - needleWidth * 0.7, y + 3);
  ctx.lineTo(x, y + needleLength * 0.7);
  ctx.lineTo(x + needleWidth * 0.7, y + 3);
  ctx.closePath();
  ctx.fillStyle = '#94a3b8';
  ctx.fill();

  // Letra "N"
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', x, y - needleLength - 1);

  ctx.restore();
};

/**
 * Desenha a barra de escala métrica real
 */
const drawScaleBar = (
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  lat: number,
  zoom: number
): number => {
  ctx.save();

  // Resolução métrica no equador e corrigida pela latitude: meters / pixel
  const latRad = (lat * Math.PI) / 180;
  const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoom);

  // Determina uma escala arredondada agradável (ex: 50m, 100m, 200m, 500m)
  const targetBarPx = 110;
  const rawMeters = targetBarPx * metersPerPixel;

  const candidateScales = [25, 50, 100, 200, 250, 500, 1000, 2000];
  let chosenMeters = candidateScales[0];
  for (const s of candidateScales) {
    if (Math.abs(s - rawMeters) < Math.abs(chosenMeters - rawMeters)) {
      chosenMeters = s;
    }
  }

  const actualBarWidth = chosenMeters / metersPerPixel;
  const barHeight = 6;
  const pad = 8;
  const boxWidth = actualBarWidth + pad * 2 + 14;
  const boxHeight = 28;

  // Caixa de fundo
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.beginPath();
  ctx.roundRect(startX - pad, startY - 14, boxWidth, boxHeight, 4);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.stroke();

  // Barra de escala bipartida (preto e branco)
  const halfBar = actualBarWidth / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(startX, startY, halfBar, barHeight);
  ctx.fillStyle = '#10b981';
  ctx.fillRect(startX + halfBar, startY, halfBar, barHeight);

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(startX, startY, actualBarWidth, barHeight);

  // Ticks verticais
  ctx.beginPath();
  ctx.moveTo(startX, startY - 2);
  ctx.lineTo(startX, startY + barHeight + 2);
  ctx.moveTo(startX + halfBar, startY - 2);
  ctx.lineTo(startX + halfBar, startY + barHeight + 2);
  ctx.moveTo(startX + actualBarWidth, startY - 2);
  ctx.lineTo(startX + actualBarWidth, startY + barHeight + 2);
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Textos
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('0', startX, startY - 3);

  const labelFinal = chosenMeters >= 1000 ? `${chosenMeters / 1000} km` : `${chosenMeters} m`;
  ctx.fillText(labelFinal, startX + actualBarWidth, startY - 3);

  ctx.font = '8px sans-serif';
  ctx.fillStyle = '#cbd5e1';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('Escala Métrica Real', startX, startY + barHeight + 3);

  ctx.restore();
  return chosenMeters;
};

/**
 * Desenha o pino numerado no centro da barragem
 */
const drawDamMarker = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  damIndex: number
) => {
  ctx.save();

  // Mira / Crosshair sutil
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(centerX - 24, centerY);
  ctx.lineTo(centerX - 8, centerY);
  ctx.moveTo(centerX + 8, centerY);
  ctx.lineTo(centerX + 24, centerY);
  ctx.moveTo(centerX, centerY - 24);
  ctx.lineTo(centerX, centerY - 8);
  ctx.moveTo(centerX, centerY + 8);
  ctx.lineTo(centerX, centerY + 24);
  ctx.stroke();

  // Sombra do marcador
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 3;

  // Corpo do pino circular
  const radius = 15;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#10b981'; // Emerald 500
  ctx.fill();

  // Borda branca destacada
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Reset de sombra para texto
  ctx.shadowColor = 'transparent';

  // Número do marcador
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(damIndex), centerX, centerY + 0.5);

  ctx.restore();
};

/**
 * Gera um enquadramento próprio em alta resolução para uma coordenada específica
 */
export const generateSatelliteFrame = async (
  options: SatelliteFrameOptions
): Promise<SatelliteFrameResult> => {
  const {
    lat: rawLat,
    long: rawLong,
    damIndex,
    damName = `Barragem ${damIndex}`,
    municipio = 'Mato Grosso',
    zoom = 16,
    width = 720,
    height = 440
  } = options;

  const { lat, lng } = resolveDecimalCoords(rawLat, rawLong);

  const now = new Date();
  const timestampStr = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}`;
  const latGMSStr = typeof rawLat === 'string' && rawLat.includes('°') ? rawLat : toGMS(lat, true);
  const longGMSStr = typeof rawLong === 'string' && rawLong.includes('°') ? rawLong : toGMS(lng, false);

  if (lat === 0 || lng === 0) {
    return {
      dataUrl: '',
      width,
      height,
      latDecimal: 0,
      longDecimal: 0,
      latGMS: latGMSStr,
      longGMS: longGMSStr,
      scaleMeters: 0,
      timestamp: timestampStr,
      error: 'Coordenadas inválidas para geração de imagem de satélite.'
    };
  }

  // Cria canvas offscreen
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return {
      dataUrl: '',
      width,
      height,
      latDecimal: lat,
      longDecimal: lng,
      latGMS: latGMSStr,
      longGMS: longGMSStr,
      scaleMeters: 0,
      timestamp: timestampStr,
      error: 'Falha ao inicializar contexto 2D do Canvas.'
    };
  }

  // Fundo cinza escuro de espera
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  // Projeção Web Mercator
  const n = Math.pow(2, zoom);
  const xCenter = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const yCenter = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;

  const minTileX = Math.floor(xCenter - width / 2 / 256);
  const maxTileX = Math.floor(xCenter + width / 2 / 256);
  const minTileY = Math.floor(yCenter - height / 2 / 256);
  const maxTileY = Math.floor(yCenter + height / 2 / 256);

  let tilesLoadedCount = 0;
  const tilePromises: Promise<void>[] = [];

  for (let tx = minTileX; tx <= maxTileX; tx++) {
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      const tileCanvasX = (tx - xCenter) * 256 + width / 2;
      const tileCanvasY = (ty - yCenter) * 256 + height / 2;

      // URL Primária: Esri World Imagery (alta resolução mundial, permite CORS)
      const primaryUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
      // URL Secundária em caso de indisponibilidade
      const secondaryUrl = `https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;

      const p = (async () => {
        try {
          const img = await loadTileImage(primaryUrl, 4500);
          ctx.drawImage(img, tileCanvasX, tileCanvasY, 256, 256);
          tilesLoadedCount++;
        } catch {
          try {
            const fallbackImg = await loadTileImage(secondaryUrl, 3500);
            ctx.drawImage(fallbackImg, tileCanvasX, tileCanvasY, 256, 256);
            tilesLoadedCount++;
          } catch {
            // Em caso de falha de conexão na tile, desenha grade cartográfica estilizada
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(tileCanvasX, tileCanvasY, 256, 256);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.strokeRect(tileCanvasX, tileCanvasY, 256, 256);
          }
        }
      })();

      tilePromises.push(p);
    }
  }

  // Aguarda carregamento de todas as tiles
  await Promise.allSettled(tilePromises);

  // Se nenhuma tile foi carregada com sucesso (offline severo)
  if (tilesLoadedCount === 0) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Grade sutil
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Aviso: Imagem de satélite não carregada (Verifique a conexão de rede)', width / 2, height / 2 - 20);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Coordenadas: LAT ${latGMSStr} | LONG ${longGMSStr}`, width / 2, height / 2 + 5);
  }

  // Desenha os elementos sobrepostos (Overlays Cartográficos Obrigatórios)
  const centerX = width / 2;
  const centerY = height / 2;

  // 1. Pino da Barragem (#N)
  drawDamMarker(ctx, centerX, centerY, damIndex);

  // 2. Rosa dos Ventos / Norte
  drawNorthArrow(ctx, width - 42, 38, 20);

  // 3. Barra de Escala Métrica Real
  const scaleMeters = drawScaleBar(ctx, 22, height - 36, lat, zoom);

  // 4. Tarja inferior de Metadados e Atribuição Cartográfica
  const bannerHeight = 22;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.fillRect(0, height - bannerHeight, width, bannerHeight);

  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 8.5px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `Fonte: Esri World Imagery • Datum SIRGAS 2000 • SEMA/MT - CSB/SURH`,
    12,
    height - bannerHeight / 2
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '8px sans-serif';
  ctx.fillText(
    `Imagem gerada em: ${timestampStr} (Data de geração do relatório — não representa a data de aquisição do satélite)`,
    width - 12,
    height - bannerHeight / 2
  );

  // Validação CORS e exportação Base64
  let dataUrl = '';
  let errorMsg: string | undefined;

  try {
    dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl || dataUrl.length < 100) {
      errorMsg = 'Falha ao codificar imagem em formato PNG.';
    }
  } catch (err: any) {
    errorMsg = `Erro de segurança ao capturar imagem (CORS tainted canvas): ${err?.message || 'restrição de origem'}`;
  }

  return {
    dataUrl,
    width,
    height,
    latDecimal: lat,
    longDecimal: lng,
    latGMS: latGMSStr,
    longGMS: longGMSStr,
    scaleMeters,
    timestamp: timestampStr,
    error: errorMsg
  };
};

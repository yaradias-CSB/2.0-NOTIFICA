import React, { useEffect, useRef, useState, useMemo, useContext } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { 
  MapPin, Globe, Layers, RotateCcw, 
  CheckCircle2, AlertCircle, Info, Crosshair, Loader2
} from 'lucide-react';
import { parseGMS, parseCoordinate, toGMS } from '../lib/coordinates';
import { DataContext } from '../contexts/DataContext';
import { NotificacaoAntigaData, BarragemSNISB, BarragemCoordenada } from '../types';

interface NotificacaoMiniMapProps {
  lat: string;
  long: string;
  barragens?: BarragemCoordenada[];
  activeBarragemIndex?: number;
  municipio?: string;
  nomeEmpreendimento?: string;
  carMt?: string;
  readOnly?: boolean;
  onSelectCoords?: (latGMS: string, longGMS: string) => void;
}

// URLs for external datasets (same as in Controle de Notificações)
const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRsNA_kn1hwAKLrBlErzLUV8yod3P_nRqHlzLHr6cWStOw8sEuodQTQLMycPfOQmA/pub?output=xlsx';
const SNISB_CSV_URL = 'https://docs.google.com/spreadsheets/d/18VwJZSAAsKU_qoJzAtxK3OxsyPNvkUD_rpZaZ1bdMnA/export?format=csv&gid=0';
const ANEEL_CSV_URL = 'https://docs.google.com/spreadsheets/d/1v0aoi5XIGqwlI7pyhev5bWEoiNW98ToNQbXtXaYCdwc/export?format=csv&gid=0';

// Memory cache across component mounts to keep everything fast & lightweight
let cachedMTGeoJson: any = null;
let cachedAntigasData: NotificacaoAntigaData[] | null = null;
let cachedSnisbData: BarragemSNISB[] | null = null;
let cachedAneelData: BarragemSNISB[] | null = null;

// Encoding fixer for Portuguese text in external spreadsheets
const fixEncoding = (str: string): string => {
  if (!str) return '';
  let fixed = str
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
    .replace(/Ã /g, 'Á')
    .replace(/Ã‚/g, 'Â')
    .replace(/Ãƒ/g, 'Ã')
    .replace(/Ã‰/g, 'É')
    .replace(/ÃŠ/g, 'Ê')
    .replace(/Ã /g, 'Í')
    .replace(/Ã“/g, 'Ó')
    .replace(/Ã”/g, 'Ô')
    .replace(/Ã•/g, 'Õ')
    .replace(/Ãš/g, 'Ú')
    .replace(/Ã‡/g, 'Ç');

  fixed = fixed.replace(/AUTUAÃÃO/g, 'AUTUAÇÃO')
               .replace(/AUTUAÃ‡ÃƒO/g, 'AUTUAÇÃO')
               .replace(/Ã‡ÃƒO/g, 'ÇÃO')
               .replace(/Ã‡/g, 'Ç')
               .replace(/Ãƒ/g, 'Ã')
               .replace(/Ã‰/g, 'É')
               .replace(/Ã /g, 'Á');

  return fixed;
};

// CSV parser for SNISB / ANEEL datasets
const parseDamsCSV = (text: string, type: 'snisb' | 'aneel'): BarragemSNISB[] => {
  const lines = text.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toUpperCase());
  const getIdx = (name: string) => headers.findIndex(h => h.includes(name.toUpperCase()));

  const idxSnisb = getIdx('CÓDIGO SNISB');
  const idxNome = getIdx('NOME DA BARRAGEM');
  const idxEmpreendedor = getIdx('EMPREENDEDOR');
  const idxMunicipio = getIdx('MUNICÍPIO');
  const idxUso = getIdx('USO PRINCIPAL');
  const idxCodBarragem = getIdx('COD BARRAGEM NA ENT FISCAL');
  const idxLat = getIdx('LATITUDE');
  const idxLong = getIdx('LONGITUDE');
  const idxDpa = getIdx('DANO POTENCIAL') !== -1 ? getIdx('DANO POTENCIAL') : 14;

  const data: BarragemSNISB[] = lines.slice(1).map((line, i) => {
    if (!line.trim()) return null;

    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cols.push(current.trim());

    if (cols.length < Math.max(idxLat, idxLong) || idxLat === -1 || idxLong === -1) return null;
    const latStr = cols[idxLat]?.trim() || '';
    const longStr = cols[idxLong]?.trim() || '';
    if (!latStr || !longStr) return null;

    return {
      id: `${type}-${i}`,
      snisb: cols[idxSnisb]?.trim() || '',
      nome: cols[idxNome]?.trim() || '',
      empreendedor: cols[idxEmpreendedor]?.trim() || '',
      municipio: cols[idxMunicipio]?.trim() || '',
      uso: cols[idxUso]?.trim() || '',
      codBarragem: cols[idxCodBarragem]?.trim() || '',
      lat: latStr,
      long: longStr,
      dpa: cols[idxDpa]?.trim() || 'Não Classificado',
      type
    };
  }).filter(Boolean) as BarragemSNISB[];

  return data;
};

// Convert decimal to NotificaForm GMS format: DD°MM'SS,SS"
const toFormGMS = (decimal: number): string => {
  if (isNaN(decimal)) return '';
  const abs = Math.abs(decimal);
  const degrees = Math.floor(abs);
  const minutesDec = (abs - degrees) * 60;
  const minutes = Math.floor(minutesDec);
  const secondsDec = (minutesDec - minutes) * 60;
  const secondsInt = Math.floor(secondsDec);
  const secondsCentis = Math.round((secondsDec - secondsInt) * 100);

  const dd = String(degrees).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secondsInt).padStart(2, '0');
  const cc = String(secondsCentis).padStart(2, '0').slice(0, 2);

  return `${dd}°${mm}'${ss},${cc}"`;
};

export const NotificacaoMiniMap: React.FC<NotificacaoMiniMapProps> = ({
  lat,
  long,
  barragens,
  activeBarragemIndex = 0,
  municipio,
  nomeEmpreendimento,
  carMt,
  readOnly = false,
  onSelectCoords
}) => {
  const { notificacoes: novasNotificacoes } = useContext(DataContext);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const multiMarkersRef = useRef<L.Marker[]>([]);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const tempClickMarkerRef = useRef<L.Marker | null>(null);

  // Layer groups for the 4 control layers
  const novasLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const antigasLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const snisbLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const aneelLayerGroupRef = useRef<L.LayerGroup | null>(null);

  // Checkbox control layer states - ALL START UNSELECTED (false) for maximum lightness
  const [showNovas, setShowNovas] = useState(false);
  const [showAntigas, setShowAntigas] = useState(false);
  const [showSnisb, setShowSnisb] = useState(false);
  const [showAneel, setShowAneel] = useState(false);

  // Dataset states loaded on demand
  const [antigasData, setAntigasData] = useState<NotificacaoAntigaData[]>(cachedAntigasData || []);
  const [snisbData, setSnisbData] = useState<BarragemSNISB[]>(cachedSnisbData || []);
  const [aneelData, setAneelData] = useState<BarragemSNISB[]>(cachedAneelData || []);

  // Loading states
  const [loadingAntigas, setLoadingAntigas] = useState(false);
  const [loadingSnisb, setLoadingSnisb] = useState(false);
  const [loadingAneel, setLoadingAneel] = useState(false);

  // Map controls states
  const [mouseGMS, setMouseGMS] = useState<string | null>(null);
  const [activeBaseLayer, setActiveBaseLayer] = useState<'satellite' | 'osm'>('satellite');
  const [showMunicipalities, setShowMunicipalities] = useState(true);
  const [geoJsonLoading, setGeoJsonLoading] = useState(false);
  const [clickedCoord, setClickedCoord] = useState<{ lat: number; lng: number } | null>(null);

  // Parse coordinates
  const parsedCoords = useMemo(() => {
    if (!lat || !long) return null;

    let pLat = parseGMS(lat);
    if (isNaN(pLat) || pLat === 0) {
      pLat = parseCoordinate(lat, true);
    }

    let pLong = parseGMS(long);
    if (isNaN(pLong) || pLong === 0) {
      pLong = parseCoordinate(long, false);
    }

    if (isNaN(pLat) || isNaN(pLong) || pLat === 0 || pLong === 0) {
      return null;
    }

    // Force negative for Mato Grosso
    if (pLat > 0) pLat = -pLat;
    if (pLong > 0) pLong = -pLong;

    // Check roughly in MT / Brazil vicinity
    const isMT = pLat >= -18.5 && pLat <= -7.0 && pLong >= -62.5 && pLong <= -50.0;

    return {
      lat: pLat,
      lng: pLong,
      isMT,
      latGMS: toGMS(pLat, true),
      lngGMS: toGMS(pLong, false)
    };
  }, [lat, long]);

  // Parse all barrage coordinates with dynamic numbered index
  const parsedBarragens = useMemo(() => {
    if (barragens && barragens.length > 0) {
      const list = barragens
        .map((b, idx) => {
          if (!b.lat || !b.long) return null;
          let pLat = parseGMS(b.lat);
          if (isNaN(pLat) || pLat === 0) pLat = parseCoordinate(b.lat, true);
          let pLong = parseGMS(b.long);
          if (isNaN(pLong) || pLong === 0) pLong = parseCoordinate(b.long, false);
          if (isNaN(pLat) || isNaN(pLong) || pLat === 0 || pLong === 0) return null;
          if (pLat > 0) pLat = -pLat;
          if (pLong > 0) pLong = -pLong;
          return {
            id: b.id || `barragem-${idx}`,
            index: idx + 1,
            nome: b.nome || `Barragem ${idx + 1}`,
            lat: pLat,
            lng: pLong,
            latGMS: b.lat,
            lngGMS: b.long
          };
        })
        .filter(Boolean) as Array<{
          id: string;
          index: number;
          nome: string;
          lat: number;
          lng: number;
          latGMS: string;
          lngGMS: string;
        }>;

      if (list.length > 0) return list;
    }

    if (parsedCoords) {
      return [{
        id: 'primary',
        index: 1,
        nome: nomeEmpreendimento || 'Barragem Principal',
        lat: parsedCoords.lat,
        lng: parsedCoords.lng,
        latGMS: parsedCoords.latGMS,
        lngGMS: parsedCoords.lngGMS
      }];
    }

    return [];
  }, [barragens, parsedCoords, nomeEmpreendimento]);

  // Tile layers refs
  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (leafletMapRef.current) return;

    // Default center Mato Grosso
    const initialCenter: [number, number] = parsedCoords 
      ? [parsedCoords.lat, parsedCoords.lng] 
      : [-12.9, -56.0];
    const initialZoom = parsedCoords ? 13 : 6;

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: initialZoom,
      zoomControl: false
    });

    leafletMapRef.current = map;

    // Layer groups initialization
    novasLayerGroupRef.current = L.layerGroup().addTo(map);
    antigasLayerGroupRef.current = L.layerGroup().addTo(map);
    snisbLayerGroupRef.current = L.layerGroup().addTo(map);
    aneelLayerGroupRef.current = L.layerGroup().addTo(map);

    // Zoom control at bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Tooltips pane high z-index
    const tooltipPane = map.getPane('tooltipPane');
    if (tooltipPane) {
      tooltipPane.style.zIndex = '10000';
    }

    // Base layers
    const satellite = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles &copy; Esri' }
    );
    satelliteLayerRef.current = satellite;

    const osm = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OpenStreetMap contributors' }
    );
    osmLayerRef.current = osm;

    // Add satellite by default
    satellite.addTo(map);

    // Mouse coordinates tracking
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      const { lat: mLat, lng: mLng } = e.latlng;
      setMouseGMS(`${toGMS(mLat, true)} | ${toGMS(mLng, false)}`);
    });

    map.on('mouseout', () => {
      setMouseGMS(null);
    });

    // Optional click on map to view or pick coordinate
    map.on('click', (e: L.LeafletMouseEvent) => {
      const { lat: cLat, lng: cLng } = e.latlng;
      setClickedCoord({ lat: cLat, lng: cLng });

      if (tempClickMarkerRef.current) {
        tempClickMarkerRef.current.remove();
      }

      const tempMarker = L.marker([cLat, cLng], {
        icon: L.divIcon({
          className: 'click-marker-pulse',
          html: `
            <div style="position: relative; width: 18px; height: 18px;">
              <div style="position: absolute; inset: 0; background: rgba(59, 130, 246, 0.4); border-radius: 9999px; animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="position: absolute; inset: 2px; background: #2563eb; border: 2px solid white; border-radius: 9999px; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>
            </div>
          `,
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        })
      }).addTo(map);

      tempClickMarkerRef.current = tempMarker;
    });

    // Load Municipalities GeoJSON
    const setupGeoJson = (data: any) => {
      if (!leafletMapRef.current) return;
      const geoJson = L.geoJSON(data, {
        style: {
          color: 'rgba(255, 255, 255, 0.65)',
          weight: 1.2,
          fillOpacity: 0.05,
          fillColor: '#ffffff'
        },
        onEachFeature: (feature, layer) => {
          if (feature.properties && feature.properties.name) {
            layer.bindTooltip(feature.properties.name, {
              sticky: true,
              className: 'municipio-tooltip',
              direction: 'top',
              offset: [0, -10]
            });
          }

          layer.on({
            mouseover: (e) => {
              const l = e.target;
              l.setStyle({
                fillOpacity: 0.25,
                weight: 2,
                color: '#10b981'
              });
            },
            mouseout: (e) => {
              const l = e.target;
              l.setStyle({
                fillOpacity: 0.05,
                weight: 1.2,
                color: 'rgba(255, 255, 255, 0.65)'
              });
            }
          });
        }
      });

      geoJson.addTo(leafletMapRef.current);
      geoJsonLayerRef.current = geoJson;
    };

    if (cachedMTGeoJson) {
      setupGeoJson(cachedMTGeoJson);
    } else {
      setGeoJsonLoading(true);
      fetch('https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-51-mun.json')
        .then(res => res.json())
        .then(data => {
          cachedMTGeoJson = data;
          setupGeoJson(data);
        })
        .catch(err => {
          console.error('Erro ao carregar malha municipal de MT no minimapa:', err);
        })
        .finally(() => {
          setGeoJsonLoading(false);
        });
    }

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      if (novasLayerGroupRef.current) novasLayerGroupRef.current.clearLayers();
      if (antigasLayerGroupRef.current) antigasLayerGroupRef.current.clearLayers();
      if (snisbLayerGroupRef.current) snisbLayerGroupRef.current.clearLayers();
      if (aneelLayerGroupRef.current) aneelLayerGroupRef.current.clearLayers();
      map.remove();
      leafletMapRef.current = null;
    };
  }, []);

  // Update base layer switch
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map || !satelliteLayerRef.current || !osmLayerRef.current) return;

    if (activeBaseLayer === 'satellite') {
      if (map.hasLayer(osmLayerRef.current)) map.removeLayer(osmLayerRef.current);
      if (!map.hasLayer(satelliteLayerRef.current)) satelliteLayerRef.current.addTo(map);
    } else {
      if (map.hasLayer(satelliteLayerRef.current)) map.removeLayer(satelliteLayerRef.current);
      if (!map.hasLayer(osmLayerRef.current)) osmLayerRef.current.addTo(map);
    }
  }, [activeBaseLayer]);

  // Toggle municipal layer
  useEffect(() => {
    const map = leafletMapRef.current;
    const layer = geoJsonLayerRef.current;
    if (!map || !layer) return;

    if (showMunicipalities) {
      if (!map.hasLayer(layer)) layer.addTo(map);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [showMunicipalities]);

  // ==========================================
  // ON-DEMAND DATA FETCHING FOR CONTROL LAYERS
  // ==========================================

  // 1. Antigas: Fetch from spreadsheet on first selection
  useEffect(() => {
    if (showAntigas && antigasData.length === 0) {
      if (cachedAntigasData && cachedAntigasData.length > 0) {
        setAntigasData(cachedAntigasData);
        return;
      }
      setLoadingAntigas(true);
      (async () => {
        try {
          const XLSX = await import('xlsx');
          const response = await fetch(SPREADSHEET_URL);
          const arrayBuffer = await response.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

          let allMapped: NotificacaoAntigaData[] = [];
          workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const json: any[] = XLSX.utils.sheet_to_json(sheet, { header: 'A' });

            const mapped: NotificacaoAntigaData[] = json.slice(1)
              .filter(row => (row.B || row.D) && (row.I && row.J))
              .map((row, idx) => {
                const atendida = String(row.O || 'NÃO').toUpperCase();
                return {
                  id: `antiga-${sheetName}-${idx}`,
                  numNotificacao: fixEncoding(String(row.B || '')),
                  cpfCnpj: fixEncoding(String(row.C || '')),
                  empreendedor: fixEncoding(String(row.D || '')),
                  propriedade: fixEncoding(String(row.E || '')),
                  carMt: fixEncoding(String(row.F || '')),
                  dataEmissao: String(row.G || ''),
                  prazo: fixEncoding(String(row.H || '')),
                  lat: String(row.I || ''),
                  long: String(row.J || ''),
                  municipio: fixEncoding(String(row.K || '')),
                  respostaFinal: fixEncoding(String(row.N || '')),
                  atendida,
                  diasAtraso: 0,
                  origem: 'Antiga'
                };
              });
            allMapped = [...allMapped, ...mapped];
          });

          cachedAntigasData = allMapped;
          setAntigasData(allMapped);
        } catch (err) {
          console.error('Erro ao carregar notificações antigas no minimapa:', err);
        } finally {
          setLoadingAntigas(false);
        }
      })();
    }
  }, [showAntigas, antigasData.length]);

  // 2. SNISB: Fetch CSV on first selection
  useEffect(() => {
    if (showSnisb && snisbData.length === 0) {
      if (cachedSnisbData && cachedSnisbData.length > 0) {
        setSnisbData(cachedSnisbData);
        return;
      }
      setLoadingSnisb(true);
      fetch(SNISB_CSV_URL)
        .then(res => res.text())
        .then(text => {
          const parsed = parseDamsCSV(text, 'snisb');
          cachedSnisbData = parsed;
          setSnisbData(parsed);
        })
        .catch(err => {
          console.error('Erro ao carregar dados SNISB no minimapa:', err);
        })
        .finally(() => {
          setLoadingSnisb(false);
        });
    }
  }, [showSnisb, snisbData.length]);

  // 3. ANEEL: Fetch CSV on first selection
  useEffect(() => {
    if (showAneel && aneelData.length === 0) {
      if (cachedAneelData && cachedAneelData.length > 0) {
        setAneelData(cachedAneelData);
        return;
      }
      setLoadingAneel(true);
      fetch(ANEEL_CSV_URL)
        .then(res => res.text())
        .then(text => {
          const parsed = parseDamsCSV(text, 'aneel');
          cachedAneelData = parsed;
          setAneelData(parsed);
        })
        .catch(err => {
          console.error('Erro ao carregar dados ANEEL no minimapa:', err);
        })
        .finally(() => {
          setLoadingAneel(false);
        });
    }
  }, [showAneel, aneelData.length]);

  // ==========================================
  // RENDER CONTROL LAYERS ON MAP
  // ==========================================

  // Layer 1: Novas (Blue)
  useEffect(() => {
    const map = leafletMapRef.current;
    const group = novasLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (showNovas) {
      novasNotificacoes.forEach(n => {
        if (!n.lat || !n.long) return;
        const latVal = parseGMS(n.lat);
        const lngVal = parseGMS(n.long);
        if (isNaN(latVal) || isNaN(lngVal) || latVal === 0 || lngVal === 0) return;

        const circle = L.circleMarker([latVal, lngVal], {
          radius: 6,
          color: '#1d4ed8',
          fillColor: '#3b82f6',
          fillOpacity: 0.85,
          weight: 2
        });

        const popupHtml = `
          <div style="font-family: sans-serif; min-width: 210px; padding: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <span style="font-size: 9px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; background: #dbeafe; padding: 2px 6px; border-radius: 4px;">Notificação Sistema</span>
              <span style="font-size: 9px; color: #64748b; font-weight: 700;">${n.situacao || 'Em aberto'}</span>
            </div>
            <div style="font-size: 12px; font-weight: 800; color: #0f172a; line-height: 1.2; margin-top: 4px;">
              ${n.nomeFantasia || n.empreendedorNome || 'Sem Identificação'}
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 4px;">
              <b>Município:</b> ${n.municipioEmpreendimento || '-'}
            </div>
            ${n.carMt ? `<div style="font-size: 10px; color: #64748b; font-family: monospace; margin-top: 2px;">CAR: ${n.carMt}</div>` : ''}
            ${n.notificacaoGerada ? `<div style="font-size: 10px; color: #1e293b; font-weight: 600; margin-top: 2px;">Notificação nº: ${n.notificacaoGerada}</div>` : ''}
            <div style="font-size: 9px; font-family: monospace; color: #64748b; margin-top: 6px; border-top: 1px solid #f1f5f9; padding-top: 4px;">
              Lat: ${toGMS(latVal, true)} | Long: ${toGMS(lngVal, false)}
            </div>
          </div>
        `;
        circle.bindPopup(popupHtml, { maxWidth: 280 });
        circle.bindTooltip(`Nova: ${n.nomeFantasia || n.empreendedorNome || 'Notificação'}`, {
          direction: 'top',
          offset: [0, -6]
        });

        group.addLayer(circle);
      });

      if (!map.hasLayer(group)) {
        group.addTo(map);
      }
    } else {
      if (map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }, [showNovas, novasNotificacoes]);

  // Layer 2: Antigas (Amber)
  useEffect(() => {
    const map = leafletMapRef.current;
    const group = antigasLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (showAntigas && antigasData.length > 0) {
      antigasData.forEach(item => {
        if (!item.lat || !item.long) return;
        const latVal = parseGMS(item.lat);
        const lngVal = parseGMS(item.long);
        if (isNaN(latVal) || isNaN(lngVal) || latVal === 0 || lngVal === 0) return;

        const circle = L.circleMarker([latVal, lngVal], {
          radius: 6,
          color: '#b45309',
          fillColor: '#f59e0b',
          fillOpacity: 0.85,
          weight: 2
        });

        const popupHtml = `
          <div style="font-family: sans-serif; min-width: 210px; padding: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <span style="font-size: 9px; font-weight: 800; color: #b45309; text-transform: uppercase; background: #fef3c7; padding: 2px 6px; border-radius: 4px;">Notificação Antiga</span>
              <span style="font-size: 9px; font-weight: 700; color: ${item.atendida === 'SIM' ? '#16a34a' : '#dc2626'};">Atendida: ${item.atendida || 'NÃO'}</span>
            </div>
            <div style="font-size: 12px; font-weight: 800; color: #0f172a; line-height: 1.2; margin-top: 4px;">
              ${item.propriedade || item.empreendedor || 'Notificação Histórica'}
            </div>
            ${item.empreendedor ? `<div style="font-size: 11px; color: #475569; margin-top: 2px;"><b>Empreendedor:</b> ${item.empreendedor}</div>` : ''}
            <div style="font-size: 11px; color: #475569; margin-top: 2px;">
              <b>Município:</b> ${item.municipio || '-'}
            </div>
            ${item.numNotificacao ? `<div style="font-size: 10px; color: #1e293b; font-weight: 600; margin-top: 2px;">Notificação nº: ${item.numNotificacao}</div>` : ''}
            ${item.carMt ? `<div style="font-size: 10px; color: #64748b; font-family: monospace; margin-top: 2px;">CAR: ${item.carMt}</div>` : ''}
            <div style="font-size: 9px; font-family: monospace; color: #64748b; margin-top: 6px; border-top: 1px solid #f1f5f9; padding-top: 4px;">
              Lat: ${toGMS(latVal, true)} | Long: ${toGMS(lngVal, false)}
            </div>
          </div>
        `;
        circle.bindPopup(popupHtml, { maxWidth: 280 });
        circle.bindTooltip(`Antiga: ${item.numNotificacao || item.propriedade || 'Notificação'}`, {
          direction: 'top',
          offset: [0, -6]
        });

        group.addLayer(circle);
      });

      if (!map.hasLayer(group)) {
        group.addTo(map);
      }
    } else {
      if (map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }, [showAntigas, antigasData]);

  // Layer 3: SNISB (Sky Blue)
  useEffect(() => {
    const map = leafletMapRef.current;
    const group = snisbLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (showSnisb && snisbData.length > 0) {
      snisbData.forEach(item => {
        if (!item.lat || !item.long) return;
        const latVal = parseGMS(item.lat);
        const lngVal = parseGMS(item.long);
        if (isNaN(latVal) || isNaN(lngVal) || latVal === 0 || lngVal === 0) return;

        const circle = L.circleMarker([latVal, lngVal], {
          radius: 5,
          color: '#0284c7',
          fillColor: '#38bdf8',
          fillOpacity: 0.85,
          weight: 1.5
        });

        const popupHtml = `
          <div style="font-family: sans-serif; min-width: 210px; padding: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <span style="font-size: 9px; font-weight: 800; color: #0369a1; text-transform: uppercase; background: #e0f2fe; padding: 2px 6px; border-radius: 4px;">SNISB</span>
              <span style="font-size: 9px; font-mono; color: #64748b; font-weight: 700;">#${item.snisb || '-'}</span>
            </div>
            <div style="font-size: 12px; font-weight: 800; color: #0f172a; line-height: 1.2; margin-top: 4px;">
              ${item.nome || 'Barragem SNISB'}
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 4px;">
              <b>Empreendedor:</b> ${item.empreendedor || '-'}
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 2px;">
              <b>Município:</b> ${item.municipio || '-'}
            </div>
            ${item.uso ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;"><b>Uso:</b> ${item.uso}</div>` : ''}
            <div style="font-size: 9px; font-family: monospace; color: #64748b; margin-top: 6px; border-top: 1px solid #f1f5f9; padding-top: 4px;">
              Lat: ${toGMS(latVal, true)} | Long: ${toGMS(lngVal, false)}
            </div>
          </div>
        `;
        circle.bindPopup(popupHtml, { maxWidth: 280 });
        circle.bindTooltip(`SNISB: ${item.nome}`, { direction: 'top', offset: [0, -5] });

        group.addLayer(circle);
      });

      if (!map.hasLayer(group)) {
        group.addTo(map);
      }
    } else {
      if (map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }, [showSnisb, snisbData]);

  // Layer 4: ANEEL (Emerald)
  useEffect(() => {
    const map = leafletMapRef.current;
    const group = aneelLayerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    if (showAneel && aneelData.length > 0) {
      aneelData.forEach(item => {
        if (!item.lat || !item.long) return;
        const latVal = parseGMS(item.lat);
        const lngVal = parseGMS(item.long);
        if (isNaN(latVal) || isNaN(lngVal) || latVal === 0 || lngVal === 0) return;

        const circle = L.circleMarker([latVal, lngVal], {
          radius: 5,
          color: '#047857',
          fillColor: '#10b981',
          fillOpacity: 0.85,
          weight: 1.5
        });

        const popupHtml = `
          <div style="font-family: sans-serif; min-width: 210px; padding: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px;">
              <span style="font-size: 9px; font-weight: 800; color: #047857; text-transform: uppercase; background: #d1fae5; padding: 2px 6px; border-radius: 4px;">ANEEL</span>
              <span style="font-size: 9px; font-mono; color: #64748b; font-weight: 700;">#${item.snisb || '-'}</span>
            </div>
            <div style="font-size: 12px; font-weight: 800; color: #0f172a; line-height: 1.2; margin-top: 4px;">
              ${item.nome || 'Barragem ANEEL'}
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 4px;">
              <b>Empreendedor:</b> ${item.empreendedor || '-'}
            </div>
            <div style="font-size: 11px; color: #475569; margin-top: 2px;">
              <b>Município:</b> ${item.municipio || '-'}
            </div>
            ${item.uso ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;"><b>Uso:</b> ${item.uso}</div>` : ''}
            <div style="font-size: 9px; font-family: monospace; color: #64748b; margin-top: 6px; border-top: 1px solid #f1f5f9; padding-top: 4px;">
              Lat: ${toGMS(latVal, true)} | Long: ${toGMS(lngVal, false)}
            </div>
          </div>
        `;
        circle.bindPopup(popupHtml, { maxWidth: 280 });
        circle.bindTooltip(`ANEEL: ${item.nome}`, { direction: 'top', offset: [0, -5] });

        group.addLayer(circle);
      });

      if (!map.hasLayer(group)) {
        group.addTo(map);
      }
    } else {
      if (map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }, [showAneel, aneelData]);

  // ==========================================
  // DYNAMIC TARGET PINS (ORDERED BARRAGENS)
  // ==========================================
  useEffect(() => {
    const map = leafletMapRef.current;
    if (!map) return;

    map.invalidateSize();

    // Remove existing single marker
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    // Remove existing multiple numbered markers
    if (multiMarkersRef.current && multiMarkersRef.current.length > 0) {
      multiMarkersRef.current.forEach(m => m.remove());
      multiMarkersRef.current = [];
    }

    if (parsedBarragens.length > 0) {
      const createdMarkers: L.Marker[] = [];

      parsedBarragens.forEach((b) => {
        const targetLatLng: [number, number] = [b.lat, b.lng];
        const isActive = activeBarragemIndex !== undefined && b.index === (activeBarragemIndex + 1);

        // Animated numbered badge pin with highlight for active dam
        const marker = L.marker(targetLatLng, {
          zIndexOffset: isActive ? 2000 : (1200 + (100 - b.index)),
          icon: L.divIcon({
            className: 'barragem-numbered-marker',
            html: `
              <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transform: translate(-50%, -100%);">
                <div style="
                  background: ${isActive ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : 'linear-gradient(135deg, #64748b 0%, #475569 100%)'};
                  color: #ffffff;
                  width: ${isActive ? '36px' : '30px'};
                  height: ${isActive ? '36px' : '30px'};
                  border-radius: 50%;
                  border: ${isActive ? '3px solid #f59e0b' : '2.5px solid #ffffff'};
                  box-shadow: ${isActive ? '0 0 0 4px rgba(245, 158, 11, 0.45), 0 6px 14px rgba(0,0,0,0.45)' : '0 4px 10px rgba(0,0,0,0.35)'};
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  font-weight: 900;
                  font-size: ${isActive ? '15px' : '13px'};
                  font-family: system-ui, -apple-system, sans-serif;
                ">
                  ${b.index}
                </div>
                <div style="
                  width: 0; 
                  height: 0; 
                  border-left: 6px solid transparent;
                  border-right: 6px solid transparent;
                  border-top: 7px solid ${isActive ? '#f59e0b' : '#475569'};
                  margin-top: -1px;
                "></div>
              </div>
            `,
            iconSize: [36, 42],
            iconAnchor: [0, 0]
          })
        }).addTo(map);

        // Tooltip with details
        const tooltipHtml = `
          <div class="p-2 min-w-[200px] text-slate-800">
            <div class="font-bold text-xs text-emerald-800 uppercase flex items-center gap-1.5 mb-1">
              <span class="w-4 h-4 rounded-full ${isActive ? 'bg-amber-500' : 'bg-emerald-600'} text-white font-black flex items-center justify-center text-[10px]">${b.index}</span>
              <span>${b.nome}</span>
              ${isActive ? '<span class="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-extrabold border border-amber-300">EM EDIÇÃO</span>' : ''}
            </div>
            ${municipio ? `<div class="text-[10px] text-slate-600 font-semibold mb-0.5">Município: <span class="text-slate-800">${municipio}</span></div>` : ''}
            ${carMt ? `<div class="text-[10px] text-slate-500 font-mono mb-0.5">CAR: ${carMt}</div>` : ''}
            <div class="border-t border-slate-100 pt-1 text-[9px] font-mono text-slate-500">
              <div>Lat: ${b.latGMS}</div>
              <div>Long: ${b.lngGMS}</div>
            </div>
          </div>
        `;

        marker.bindTooltip(tooltipHtml, {
          permanent: parsedBarragens.length <= 4,
          direction: 'top',
          className: 'custom-map-tooltip',
          offset: [0, -38]
        });

        createdMarkers.push(marker);
      });

      multiMarkersRef.current = createdMarkers;

      // Fly or Fit bounds depending on count
      if (parsedBarragens.length > 1) {
        const bounds = L.latLngBounds(parsedBarragens.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } else if (parsedBarragens.length === 1) {
        const targetZoom = Math.max(map.getZoom(), 13);
        map.flyTo([parsedBarragens[0].lat, parsedBarragens[0].lng], targetZoom, {
          duration: 1.0,
          easeLinearity: 0.25
        });
      }
    }
  }, [parsedBarragens, municipio, carMt, activeBarragemIndex]);

  const handleResetToMT = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    map.flyTo([-12.9, -56.0], 6, { duration: 0.8 });
  };

  const handleFocusCoords = () => {
    const map = leafletMapRef.current;
    if (!map) return;
    if (parsedBarragens.length > 1) {
      const bounds = L.latLngBounds(parsedBarragens.map(p => [p.lat, p.lng]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    } else if (parsedBarragens.length === 1) {
      map.flyTo([parsedBarragens[0].lat, parsedBarragens[0].lng], 14, { duration: 0.8 });
      if (multiMarkersRef.current[0]) {
        multiMarkersRef.current[0].openPopup();
      }
    } else if (parsedCoords) {
      map.flyTo([parsedCoords.lat, parsedCoords.lng], 14, { duration: 0.8 });
    } else {
      map.flyTo([-12.9, -56.0], 6, { duration: 0.8 });
    }
  };

  const handleApplyClickedCoords = () => {
    if (!clickedCoord || !onSelectCoords) return;
    const formLat = toFormGMS(clickedCoord.lat);
    const formLong = toFormGMS(clickedCoord.lng);
    onSelectCoords(formLat, formLong);
    setClickedCoord(null);
    if (tempClickMarkerRef.current) {
      tempClickMarkerRef.current.remove();
      tempClickMarkerRef.current = null;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header bar */}
      <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100 shadow-sm">
            <MapPin size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                Minimapa de Conferência Geográfica (Mato Grosso)
              </h3>
              <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 rounded-md">
                Modo Leve
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Ao digitar as coordenadas acima, o mapa centraliza e aproxima o ponto para conferência imediata.
            </p>
          </div>
        </div>

        {/* Status of typed coordinates */}
        <div className="flex items-center gap-2">
          {parsedCoords ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700">
              <CheckCircle2 size={15} className="text-emerald-600" />
              <div className="text-[11px] font-bold leading-tight">
                <span className="text-slate-500">Ponto identificado:</span> {parsedCoords.latGMS} | {parsedCoords.lngGMS}
                {!parsedCoords.isMT && (
                  <span className="ml-1 text-[10px] text-amber-600 font-semibold">(Fora do MT)</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-500">
              <AlertCircle size={15} className="text-slate-400" />
              <span className="text-[11px] font-medium">Aguardando coordenadas (Latitude e Longitude)</span>
            </div>
          )}
        </div>
      </div>

      {/* Control Layers Bar: Checkboxes initialized unselected for performance, selectable for conference */}
      <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Layers size={13} className="text-slate-400" />
            Camadas de Controle:
          </span>

          {/* Novas (Blue) */}
          <label 
            className="flex items-center gap-1.5 cursor-pointer group select-none hover:opacity-100 transition-opacity"
            title="Exibir notificações registradas no sistema para conferência de proximidade"
          >
            <input 
              type="checkbox" 
              checked={showNovas} 
              onChange={(e) => setShowNovas(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span className={`text-[11px] font-bold transition-colors ${showNovas ? 'text-blue-700' : 'text-slate-600 group-hover:text-blue-600'}`}>
              Novas
            </span>
          </label>

          {/* Antigas (Amber) */}
          <label 
            className="flex items-center gap-1.5 cursor-pointer group select-none hover:opacity-100 transition-opacity"
            title="Exibir notificações antigas da planilha para conferência de proximidade"
          >
            <input 
              type="checkbox" 
              checked={showAntigas} 
              onChange={(e) => setShowAntigas(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
            />
            <span className={`text-[11px] font-bold transition-colors ${showAntigas ? 'text-amber-700' : 'text-slate-600 group-hover:text-amber-600'}`}>
              Antigas
            </span>
            {loadingAntigas && <Loader2 size={11} className="animate-spin text-amber-600 shrink-0" />}
          </label>

          {/* SNISB (Sky Blue) */}
          <label 
            className="flex items-center gap-1.5 cursor-pointer group select-none hover:opacity-100 transition-opacity"
            title="Exibir barragens cadastradas no SNISB para conferência"
          >
            <input 
              type="checkbox" 
              checked={showSnisb} 
              onChange={(e) => setShowSnisb(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-sky-500 focus:ring-sky-500 cursor-pointer"
            />
            <span className={`text-[11px] font-bold transition-colors ${showSnisb ? 'text-sky-700' : 'text-slate-600 group-hover:text-sky-600'}`}>
              SNISB
            </span>
            {loadingSnisb && <Loader2 size={11} className="animate-spin text-sky-600 shrink-0" />}
          </label>

          {/* ANEEL (Emerald) */}
          <label 
            className="flex items-center gap-1.5 cursor-pointer group select-none hover:opacity-100 transition-opacity"
            title="Exibir barragens cadastradas na ANEEL para conferência"
          >
            <input 
              type="checkbox" 
              checked={showAneel} 
              onChange={(e) => setShowAneel(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
            />
            <span className={`text-[11px] font-bold transition-colors ${showAneel ? 'text-emerald-700' : 'text-slate-600 group-hover:text-emerald-600'}`}>
              ANEEL
            </span>
            {loadingAneel && <Loader2 size={11} className="animate-spin text-emerald-600 shrink-0" />}
          </label>

          <span className="hidden xl:inline text-[10px] text-slate-400 italic">
            (Iniciam desmarcadas para leveza — marque para conferência geográfica)
          </span>
        </div>

        {/* Map view & layer toggles */}
        <div className="flex items-center gap-2">
          {/* Municipalities toggle */}
          <button
            type="button"
            onClick={() => setShowMunicipalities(!showMunicipalities)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
              showMunicipalities 
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-xs' 
                : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
            title="Alternar camada com os 142 municípios de Mato Grosso"
          >
            <Layers size={13} />
            <span>Municípios MT</span>
            {geoJsonLoading && <Loader2 size={11} className="animate-spin" />}
          </button>

          {/* Base Layer Switch */}
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-xs">
            <button
              type="button"
              onClick={() => setActiveBaseLayer('satellite')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                activeBaseLayer === 'satellite'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Satélite
            </button>
            <button
              type="button"
              onClick={() => setActiveBaseLayer('osm')}
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                activeBaseLayer === 'osm'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mapa
            </button>
          </div>

          {/* Centralizar button */}
          <button
            type="button"
            onClick={handleFocusCoords}
            disabled={parsedBarragens.length === 0 && !parsedCoords}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-bold transition-all border shadow-xs ${
              (parsedBarragens.length > 0 || parsedCoords)
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 cursor-pointer active:scale-95'
                : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
            }`}
            title={(parsedBarragens.length > 0 || parsedCoords) ? "Centralizar mapa nos pontos das barragens" : "Preencha as coordenadas para habilitar a centralização"}
          >
            <Crosshair size={13} className={(parsedBarragens.length > 0 || parsedCoords) ? "text-white" : "text-slate-400"} />
            <span>Centralizar</span>
          </button>

          <button
            type="button"
            onClick={handleResetToMT}
            className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors shadow-xs"
            title="Visão geral do Estado de Mato Grosso"
          >
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {/* Leaflet Map Canvas */}
      <div className="relative w-full h-[360px] sm:h-[420px] bg-slate-900">
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating "Centralizar" button over map for immediate 1-click re-centering */}
        {(parsedBarragens.length > 0 || parsedCoords) && (
          <button
            type="button"
            onClick={handleFocusCoords}
            className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 px-3 py-1.5 bg-white/95 hover:bg-white text-emerald-800 hover:text-emerald-900 rounded-xl shadow-lg border border-emerald-200 text-xs font-bold transition-all hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-xs group"
            title="Clique para voltar e centralizar nas barragens"
          >
            <Crosshair size={14} className="text-emerald-600 group-hover:rotate-90 transition-transform duration-300" />
            <span>Centralizar</span>
          </button>
        )}

        {/* Real-time Mouse Coordinate display (GMS) */}
        {mouseGMS && (
          <div className="absolute bottom-2 left-2 z-[1000] bg-slate-900/85 backdrop-blur-xs text-white px-2.5 py-1 rounded-md text-[10px] font-mono shadow-md border border-white/10 pointer-events-none">
            {mouseGMS}
          </div>
        )}

        {/* Click on Map notification popup */}
        {clickedCoord && !readOnly && onSelectCoords && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-xs p-3 rounded-xl shadow-xl border-2 border-emerald-500 text-xs flex flex-wrap sm:flex-nowrap items-center gap-3 animate-fade-in max-w-[90vw]">
            <div className="text-slate-700">
              <span className="font-bold text-slate-900 block text-[11px]">
                Coordenada para: <span className="text-emerald-700 font-black">{barragens?.[activeBarragemIndex ?? 0]?.nome || `Barragem #${(activeBarragemIndex ?? 0) + 1}`}</span>
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {toGMS(clickedCoord.lat, true)} | {toGMS(clickedCoord.lng, false)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleApplyClickedCoords}
                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-[10px] shadow-xs transition-colors cursor-pointer"
              >
                Usar Coordenada
              </button>
              <button
                type="button"
                onClick={() => {
                  setClickedCoord(null);
                  if (tempClickMarkerRef.current) {
                    tempClickMarkerRef.current.remove();
                    tempClickMarkerRef.current = null;
                  }
                }}
                className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer guidance note */}
      <div className="p-3 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <Info size={14} className="text-emerald-600 shrink-0" />
          <span>
            Passe o mouse sobre os limites para consultar o nome do município de MT.
            {!readOnly && onSelectCoords && ' Você também pode clicar no mapa para capturar uma coordenada.'}
          </span>
        </div>
        {parsedCoords && (
          <div className="text-slate-600 font-mono text-[10px]">
            Decimais: {parsedCoords.lat.toFixed(5)}, {parsedCoords.lng.toFixed(5)}
          </div>
        )}
      </div>
    </div>
  );
};

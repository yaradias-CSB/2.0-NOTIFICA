import React, { useState, useRef, useEffect, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Map as MapIcon, X, ChevronRight, ChevronLeft } from 'lucide-react';
import { ParecerData, OficioData, NotificacaoData, BarragemSNISB } from '../../types';
import { parseGMS, toGMS } from '../../lib/coordinates';

interface MTMapProps {
  pareceres: ParecerData[];
  oficios: OficioData[];
  notificacoes: NotificacaoData[];
  hoveredCity: string | null;
  setHoveredCity?: (city: string | null) => void;
  center?: [number, number];
  searchMarker?: [number, number] | null;
  isNotificationControl?: boolean;
  snisbData?: BarragemSNISB[];
  aneelData?: BarragemSNISB[];
  externalActiveFilters?: Set<FilterType>;
  onToggleFilter?: (filter: FilterType) => void;
  onSetFilters?: (filters: Set<FilterType>) => void;
}

type FilterType = 
  | 'parecerRascunho' | 'parecerConcluido' 
  | 'oficioPendente' | 'oficioExpirado' | 'oficioCumprido' | 'oficioArquivado'
  | 'notificacaoAberto' | 'notificacaoCumprida' | 'notificacaoAtrasada' | 'notificacaoArquivada'
  | 'notificacaoAntigaPendente' | 'notificacaoAntigaAtendida'
  | 'snisb' | 'aneel';

export const MTMap = React.memo<MTMapProps>(({ 
  pareceres, 
  oficios, 
  notificacoes, 
  hoveredCity, 
  setHoveredCity,
  center,
  searchMarker,
  isNotificationControl,
  snisbData = [],
  aneelData = [],
  externalActiveFilters,
  onToggleFilter,
  onSetFilters
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.LayerGroup | null>(null);
  const markersRef = useRef<{ [key: string]: (L.CircleMarker | L.Marker)[] }>({});
  
  const [internalActiveFilters, setInternalActiveFilters] = useState<Set<FilterType>>(new Set([
    'parecerRascunho', 'parecerConcluido', 
    'oficioPendente', 'oficioExpirado', 'oficioCumprido', 'oficioArquivado',
    'notificacaoAberto', 'notificacaoCumprida', 'notificacaoAtrasada', 'notificacaoArquivada',
    'notificacaoAntigaPendente', 'notificacaoAntigaAtendida',
    'snisb'
  ]));

  const activeFilters = externalActiveFilters || internalActiveFilters;
  const [mouseGMS, setMouseGMS] = useState<string | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  const toggleFilter = (filter: FilterType) => {
    if (onToggleFilter) {
      onToggleFilter(filter);
    } else {
      setInternalActiveFilters(prev => {
        const next = new Set(prev);
        if (next.has(filter)) next.delete(filter);
        else next.add(filter);
        return next;
      });
    }
  };

  const ALL_FILTERS: FilterType[] = [
    'parecerRascunho', 'parecerConcluido', 
    'oficioPendente', 'oficioExpirado', 'oficioCumprido', 'oficioArquivado',
    'notificacaoAberto', 'notificacaoCumprida', 'notificacaoAtrasada', 'notificacaoArquivada',
    'notificacaoAntigaPendente', 'notificacaoAntigaAtendida',
    'snisb', 'aneel'
  ];

  const selectAll = () => {
    const next = new Set(ALL_FILTERS);
    if (onSetFilters) {
      onSetFilters(next);
    } else if (onToggleFilter) {
      // Fallback if onSetFilters not provided but onToggleFilter is
      ALL_FILTERS.forEach(f => {
        if (!activeFilters.has(f)) onToggleFilter(f);
      });
    } else {
      setInternalActiveFilters(next);
    }
  };

  const deselectAll = () => {
    const next = new Set<FilterType>();
    if (onSetFilters) {
      onSetFilters(next);
    } else if (onToggleFilter) {
      // Fallback
      ALL_FILTERS.forEach(f => {
        if (activeFilters.has(f)) onToggleFilter(f);
      });
    } else {
      setInternalActiveFilters(next);
    }
  };

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current).setView([-12.9, -56.0], 6);
      
      // Ensure tooltips are always on top and not clipped
      const tooltipPane = leafletMap.current.getPane('tooltipPane');
      if (tooltipPane) {
        tooltipPane.style.zIndex = '10000';
      }

      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      });

      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
      });

      satellite.addTo(leafletMap.current);

      leafletMap.current.on('mousemove', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setMouseGMS(`${toGMS(lat, true)} | ${toGMS(lng, false)}`);
      });

      leafletMap.current.on('mouseout', () => {
        setMouseGMS(null);
      });

      const municipiosLayer = L.layerGroup();
      
      fetch('https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-51-mun.json')
        .then(res => res.json())
        .then(data => {
          if (leafletMap.current) {
            const geoJson = L.geoJSON(data, {
              style: {
                color: 'rgba(255, 255, 255, 0.5)',
                weight: 1,
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
                      fillOpacity: 0.2,
                      weight: 2,
                      color: '#ffffff'
                    });
                  },
                  mouseout: (e) => {
                    const l = e.target;
                    l.setStyle({
                      fillOpacity: 0.05,
                      weight: 1,
                      color: 'rgba(255, 255, 255, 0.5)'
                    });
                  }
                });
              }
            });
            geoJson.addTo(municipiosLayer);
            geoJsonLayerRef.current = geoJson;
          }
        })
        .catch(err => console.error('Erro ao carregar limites municipais:', err));

      municipiosLayer.addTo(leafletMap.current);
      markersLayerRef.current = L.layerGroup().addTo(leafletMap.current);

      L.control.layers({
        "Satélite": satellite,
        "OpenStreetMap": osm
      }, {
        "Limites Municipais": municipiosLayer
      }, { position: 'topright' }).addTo(leafletMap.current);
    }

    const map = leafletMap.current;
    if (!map || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    markersRef.current = {};

    const groupedDocs: { [key: string]: { lat: number; lng: number; items: any[]; municipio: string } } = {};

    const addToGroup = (lat: number, lng: number, item: any, municipio: string) => {
      const key = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (!groupedDocs[key]) {
        groupedDocs[key] = { lat, lng, items: [], municipio };
      }
      groupedDocs[key].items.push(item);
    };

    pareceres.forEach(item => {
      const isConcluido = item.status === 'Concluído';
      if (isConcluido && !activeFilters.has('parecerConcluido')) return;
      if (!isConcluido && !activeFilters.has('parecerRascunho')) return;
      
      const latData = item.coordenadasGMS?.lat || (item as any).barragemPrincipal?.lat || (item as any).lat || '';
      const lngData = item.coordenadasGMS?.long || (item as any).barragemPrincipal?.long || (item as any).long || '';
      const lat = parseGMS(latData);
      const lng = parseGMS(lngData);
      if (!isNaN(lat) && !isNaN(lng)) {
        addToGroup(lat, lng, { ...item, type: 'parecer' }, item.municipio || 'Desconhecido');
      }
    });

    oficios.forEach(item => {
      const situacao = item.situacaoCumprimento;
      if (situacao === 'Pendente' && !activeFilters.has('oficioPendente')) return;
      if (situacao === 'Não cumprido no prazo' && !activeFilters.has('oficioExpirado')) return;
      if (situacao === 'Cumprido' && !activeFilters.has('oficioCumprido')) return;
      if (situacao === 'Arquivado' && !activeFilters.has('oficioArquivado')) return;

      if (!item.coordenadasGMS?.lat || !item.coordenadasGMS?.long) return;
      const lat = parseGMS(item.coordenadasGMS.lat);
      const lng = parseGMS(item.coordenadasGMS.long);
      if (!isNaN(lat) && !isNaN(lng)) {
        addToGroup(lat, lng, { ...item, type: 'oficio' }, (item as any).municipio || 'Desconhecido');
      }
    });

    notificacoes.forEach(item => {
      const isAntiga = (item as any).origem === 'Antiga';
      if (isAntiga) {
        const isAtendida = item.atendida === 'SIM';
        if (isAtendida && !activeFilters.has('notificacaoAntigaAtendida')) return;
        if (!isAtendida && !activeFilters.has('notificacaoAntigaPendente')) return;
      } else {
        const situacao = item.situacao || 'Em aberto';
        if (situacao === 'Em aberto' && !activeFilters.has('notificacaoAberto')) return;
        if (situacao === 'Cumprida' && !activeFilters.has('notificacaoCumprida')) return;
        if (situacao === 'Não cumprida no prazo' && !activeFilters.has('notificacaoAtrasada')) return;
        if (situacao === 'Arquivada' && !activeFilters.has('notificacaoArquivada')) return;
      }
      
      if (!item.lat || !item.long) return;
      const lat = parseGMS(item.lat);
      const lng = parseGMS(item.long);
      if (!isNaN(lat) && !isNaN(lng)) {
        const muni = item.municipioEmpreendimento || (item as any).municipio || 'Desconhecido';
        addToGroup(lat, lng, { ...item, type: 'notificacao' }, muni);
      }
    });

    snisbData.forEach(item => {
      if (!activeFilters.has('snisb')) return;
      if (!item.lat || !item.long) return;
      const lat = parseGMS(item.lat);
      const lng = parseGMS(item.long);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        addToGroup(lat, lng, { ...item, type: 'snisb' }, item.municipio || 'Desconhecido');
      }
    });

    aneelData.forEach(item => {
      if (!activeFilters.has('aneel')) return;
      if (!item.lat || !item.long) return;
      const lat = parseGMS(item.lat);
      const lng = parseGMS(item.long);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        addToGroup(lat, lng, { ...item, type: 'aneel' }, item.municipio || 'Desconhecido');
      }
    });

    Object.values(groupedDocs).forEach(group => {
      const { lat, lng, items, municipio } = group;
      const isMulti = items.length > 1;
      
      let markerColor = '#87CEEB';
      const hasConcluidoParecer = items.some(i => i.type === 'parecer' && i.status === 'Concluído');
      const hasOficio = items.some(i => i.type === 'oficio');
      const hasNotificacao = items.some(i => i.type === 'notificacao');
      const hasSnisb = items.some(i => i.type === 'snisb');
      const hasAneel = items.some(i => i.type === 'aneel');
      
      if (hasConcluidoParecer) markerColor = '#0000CD';
      else if (hasNotificacao) {
        const hasAntiga = items.some(i => i.type === 'notificacao' && i.origem === 'Antiga');
        markerColor = hasAntiga ? '#FBBF24' : '#7B3FE4';
      }
      else if (hasOficio) markerColor = '#fbbf24';
      else if (hasSnisb) markerColor = '#60A5FA';
      else if (hasAneel) markerColor = '#10B981';
      
      if (!hasConcluidoParecer && !hasNotificacao && items.every(i => i.type === 'oficio')) {
        const firstOficio = items[0];
        if (firstOficio.situacaoCumprimento === 'Arquivado') markerColor = '#94a3b8';
        else if (firstOficio.situacaoCumprimento === 'Cumprido') markerColor = '#10b981';
        else if (firstOficio.situacaoCumprimento === 'Não cumprido no prazo') markerColor = '#ef4444';
      }

      if (!hasConcluidoParecer && !hasOficio && items.every(i => i.type === 'notificacao')) {
        const firstNotif = items[0];
        const situacao = firstNotif.situacao || 'Em aberto';
        if (situacao === 'Arquivada') markerColor = '#9C8ACF';
        else if (situacao === 'Cumprida') markerColor = '#FFFFFF';
        else if (situacao === 'Não cumprida no prazo') markerColor = '#FF9800';
        else markerColor = '#7B3FE4';
      }

  const mainMarker = L.circleMarker([lat, lng], {
        radius: (items.length === 1 && (items[0].type === 'snisb' || items[0].type === 'aneel')) ? 4 : 6,
        fillColor: markerColor,
        color: (items.length === 1 && items[0].type === 'notificacao' && items[0].situacao === 'Cumprida') ? '#7B3FE4' : ((items.length === 1 && (items[0].type === 'snisb' || items[0].type === 'aneel')) ? (items[0].type === 'snisb' ? '#1D4ED8' : '#059669') : '#000'),
        weight: (items.length === 1 && items[0].type === 'notificacao' && items[0].situacao === 'Cumprida') ? 2 : ((items.length === 1 && (items[0].type === 'snisb' || items[0].type === 'aneel')) ? 1.5 : 1),
        opacity: (items.length === 1 && (items[0].type === 'snisb' || items[0].type === 'aneel')) ? 0.8 : 1,
        fillOpacity: (items.length === 1 && (items[0].type === 'snisb' || items[0].type === 'aneel')) ? 0.8 : 0.9,
        className: (items.length === 1 && (items[0].type === 'snisb' || items[0].type === 'aneel')) ? 'snisb-marker-shadow' : ''
      });
      (mainMarker as any).originalColor = markerColor;
      (mainMarker as any).municipio = municipio;

      mainMarker.addTo(markersLayerRef.current!);
      
      if (!markersRef.current[municipio]) {
        markersRef.current[municipio] = [];
      }
      markersRef.current[municipio].push(mainMarker);

      if (items.length === 1 && items[0].type === 'notificacao') {
        const item = items[0];
        const situacao = item.situacao || 'Em aberto';
        const isAntiga = item.origem === 'Antiga';
        
        let iconHtml = '!';
        let iconColor = 'white';
        let extraRing = '';

        if (isAntiga) {
          const isAtendida = item.atendida === 'SIM';
          iconHtml = `
            <div style="
              width: 0; 
              height: 0; 
              border-left: 8px solid transparent;
              border-right: 8px solid transparent;
              border-bottom: 14px solid #FBBF24;
              position: relative;
              display: flex;
              align-items: center;
              justify-content: center;
            ">
              <span style="
                position: absolute;
                top: 3px;
                left: 50%;
                transform: translateX(-50%);
                color: ${isAtendida ? '#10b981' : '#FF0000'};
                font-size: 10px;
                font-weight: 900;
                text-shadow: 0 0 1px white;
              ">${isAtendida ? 'V' : '!'}</span>
            </div>
          `;
          iconColor = 'transparent';
        } else {
          if (situacao === 'Cumprida') {
            iconHtml = '✓';
            iconColor = '#7B3FE4';
          } else if (situacao === 'Não cumprida no prazo') {
            iconHtml = '!';
            iconColor = 'white';
            extraRing = `<div style="position: absolute; top: -4.5px; left: -4.5px; width: 9px; height: 9px; background-color: #7B3FE4; border-radius: 50%; border: 1px solid white; z-index: 5; box-shadow: 0 0 2px rgba(0,0,0,0.3);"></div>`;
          } else if (situacao === 'Arquivada') {
            iconHtml = '📁';
          }
        }

        const iconMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'notificacao-icon',
            html: `
              <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 0; height: 0;">
                ${extraRing}
                <span style="color: ${iconColor}; font-size: 8px; font-weight: bold; pointer-events: none; z-index: 10;">${iconHtml}</span>
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          }),
          interactive: false
        });
        (iconMarker as any).municipio = municipio;
        iconMarker.addTo(markersLayerRef.current!);
        if (!markersRef.current[municipio]) markersRef.current[municipio] = [];
        markersRef.current[municipio].push(iconMarker as any);
      }

      if (!isMulti && items[0].type === 'oficio' && items[0].situacaoCumprimento === 'Cumprido') {
        mainMarker.setStyle({
          fillColor: '#10b981',
          fillOpacity: 0.5
        });
      }

      const latGMS = toGMS(lat, true);
      const lngGMS = toGMS(lng, false);

      let tooltipContent = `<div class="p-2 min-w-[240px] font-sans max-h-[300px] overflow-y-auto">`;
      
      // Header de Coordenadas em GMS
      tooltipContent += `
        <div class="mb-3 pb-2 border-b border-slate-100">
          <div class="text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Localização (GMS)</div>
          <div class="grid grid-cols-2 gap-2">
            <div class="px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
              <div class="text-[7px] text-slate-400 font-bold uppercase tracking-tighter">Latitude</div>
              <div class="text-[10px] font-mono font-bold text-slate-700">${latGMS}</div>
            </div>
            <div class="px-2 py-1 bg-slate-50 rounded-lg border border-slate-100">
              <div class="text-[7px] text-slate-400 font-bold uppercase tracking-tighter">Longitude</div>
              <div class="text-[10px] font-mono font-bold text-slate-700">${lngGMS}</div>
            </div>
          </div>
        </div>
      `;

      if (isMulti) {
        tooltipContent += `<div class="text-[10px] font-black text-slate-400 uppercase mb-2 border-b border-slate-100 pb-1">${items.length} DOCUMENTOS NESTE LOCAL</div>`;
      }

      items.forEach((item, idx) => {
        if (idx > 0) tooltipContent += `<div class="my-2 border-t border-slate-100"></div>`;
        if (item.type === 'parecer') {
          const protocolo = item.processo || item.protocolo || '';
          const empreendedor = item.identificacaoEmpreendedor || item.razaoSocial || item.interessado || '';
          tooltipContent += `
            <div class="py-1">
              <div class="flex justify-between items-start">
                <div class="text-[9px] font-bold text-blue-600 uppercase">Parecer Técnico</div>
                <span class="text-[8px] font-bold text-slate-400 uppercase">#${protocolo}</span>
              </div>
              <div class="text-xs font-black text-slate-900 leading-tight mt-0.5">${empreendedor}</div>
              <div class="text-[9px] text-slate-500 mt-1">Status: <span class="font-bold">${item.status}</span></div>
            </div>
          `;
        } else if (item.type === 'oficio') {
          tooltipContent += `
            <div class="py-1">
              <div class="flex justify-between items-start">
                <div class="text-[9px] font-bold text-amber-600 uppercase">Ofício de Pendências</div>
                <span class="text-[8px] font-bold text-slate-400 uppercase">#${item.protocolo}</span>
              </div>
              <div class="text-xs font-black text-slate-900 leading-tight mt-0.5">${item.interessado}</div>
              <div class="flex items-center justify-between mt-1">
                <span class="text-[9px] text-slate-500">Situação: <span class="font-bold">${item.situacaoCumprimento || 'Pendente'}</span></span>
              </div>
            </div>
          `;
        } else if (item.type === 'notificacao') {
          const isAntiga = item.origem === 'Antiga';
          tooltipContent += `
            <div class="py-1">
              <div class="flex justify-between items-start">
                <div class="text-[9px] font-bold text-purple-600 uppercase">Notificação ${isAntiga ? '(Antiga)' : '(Nova)'}</div>
                <span class="text-[8px] font-bold text-slate-400 uppercase">#${item.numNotificacao || item.numProcesso}</span>
              </div>
              <div class="text-xs font-black text-slate-900 leading-tight mt-0.5">${item.empreendedor || item.empreendedorNome}</div>
              <div class="text-[10px] text-slate-500 mt-0.5 font-medium">${item.propriedade || item.nomeFantasia || ''}</div>
              
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 pt-2 border-t border-slate-50">
                <div>
                  <div class="text-[8px] font-black text-slate-400 uppercase">Data</div>
                  <div class="text-[10px] font-bold text-slate-700">${item.dataEmissao || item.dataNotificacao || '-'}</div>
                </div>
                <div>
                  <div class="text-[8px] font-black text-slate-400 uppercase">Prazo</div>
                  <div class="text-[10px] font-bold text-slate-700">${item.prazo || item.prazoVencimento || '-'}</div>
                </div>
                <div class="col-span-2">
                  <div class="text-[8px] font-black text-slate-400 uppercase">Município</div>
                  <div class="text-[10px] font-bold text-slate-700">${item.municipio || item.municipioEmpreendimento || '-'}</div>
                </div>
              </div>

              <div class="mt-2">
                <div class="text-[8px] font-black text-slate-400 uppercase">Situação/Resposta</div>
                <div class="text-[10px] font-bold text-slate-600 italic leading-tight">${item.respostaFinal || item.situacao || 'Em aberto'}</div>
                ${isAntiga ? `
                  <div class="text-[9px] mt-1 font-bold ${item.atendida === 'SIM' ? 'text-emerald-600' : 'text-rose-600'} uppercase">Atendida: ${item.atendida}</div>
                  ${item.atendida === 'NÃO' && item.diasAtraso > 0 ? `<div class="text-[9px] font-black text-rose-600 uppercase">Vencido há ${item.diasAtraso} dias</div>` : ''}
                ` : ''}
              </div>
            </div>
          `;
        } else if (item.type === 'snisb' || item.type === 'aneel') {
          const isAneel = item.type === 'aneel';
          tooltipContent += `
            <div class="py-1">
              <div class="flex justify-between items-start">
                <div class="text-[9px] font-bold ${isAneel ? 'text-emerald-600' : 'text-sky-600'} uppercase">${isAneel ? 'ANEEL' : 'SNISB'}</div>
                <span class="text-[8px] font-bold text-slate-400 uppercase">#${item.snisb}</span>
              </div>
              <div class="text-xs font-black text-slate-900 leading-tight mt-0.5">${item.nome}</div>
              <div class="text-[10px] text-slate-500 mt-0.5 font-medium">${item.empreendedor}</div>
              
              <div class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 pt-2 border-t border-slate-50">
                <div>
                  <div class="text-[8px] font-black text-slate-400 uppercase">Cód. Barragem</div>
                  <div class="text-[10px] font-bold text-slate-700">${item.codBarragem}</div>
                </div>
                <div>
                  <div class="text-[8px] font-black text-slate-400 uppercase">Uso</div>
                  <div class="text-[10px] font-bold text-slate-700">${item.uso}</div>
                </div>
                <div class="col-span-2">
                  <div class="text-[8px] font-black text-slate-400 uppercase">Município</div>
                  <div class="text-[10px] font-bold text-slate-700">${item.municipio}</div>
                </div>
              </div>
            </div>
          `;
        }
      });
      tooltipContent += `</div>`;

      mainMarker.bindPopup(tooltipContent, {
        className: 'custom-map-popup',
        maxWidth: 300,
        minWidth: 240,
        closeButton: true
      });

      if (isMulti) {
        const badgeMarker = L.marker([lat, lng], {
          icon: L.divIcon({
            className: 'custom-multi-badge',
            html: `
              <div style="position: absolute; top: -10px; right: -10px; background: #ef4444; color: white; border-radius: 50%; width: 14px; height: 14px; font-size: 9px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.4);">
                ${items.length}
              </div>
            `,
            iconSize: [0, 0],
            iconAnchor: [0, 0]
          }),
          interactive: false
        });
        (badgeMarker as any).municipio = municipio;
        badgeMarker.addTo(markersLayerRef.current!);
        markersRef.current[municipio].push(badgeMarker as any);
      }
    });

    if (center && map) {
      map.flyTo(center, searchMarker ? 12 : map.getZoom());
    }

    if (searchMarker && map) {
      const marker = L.marker(searchMarker, {
        icon: L.divIcon({
          className: 'search-marker-bounce',
          html: `
            <div class="search-marker-container">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21C16 17.5 19 14.4183 19 10C19 6.13401 15.866 3 12 3C8.13401 3 5 6.13401 5 10C5 14.4183 8 17.5 12 21Z" fill="#EF4444" stroke="white" stroke-width="2"/>
                <circle cx="12" cy="10" r="3" fill="white"/>
              </svg>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 32]
        })
      }).addTo(markersLayerRef.current!);
      
      const formattedCoords = `${toGMS(searchMarker[0], true)} ${toGMS(searchMarker[1], false)}`;
      marker.bindTooltip(formattedCoords, { 
        permanent: true, 
        direction: 'top',
        className: 'search-tooltip',
        offset: [0, -32]
      });
    }

  }, [pareceres, oficios, notificacoes, snisbData, activeFilters]);

  useEffect(() => {
    Object.entries(markersRef.current).forEach(([muni, markers]) => {
      (markers as (L.CircleMarker | L.Marker)[]).forEach(marker => {
        const isCircle = marker instanceof L.CircleMarker;
        const isBadge = marker instanceof L.Marker;

        if (hoveredCity) {
          if (muni === hoveredCity) {
            if (isCircle) {
              marker.setStyle({
                radius: 10,
                fillColor: '#f59e0b',
                weight: 2,
                fillOpacity: 1
              });
              marker.bringToFront();
            }
            if (isBadge) {
              marker.setOpacity(1);
            }
          } else {
            if (isCircle) {
              marker.setStyle({
                radius: 4,
                fillOpacity: 0.2,
                opacity: 0.2
              });
            }
            if (isBadge) {
              marker.setOpacity(0.1);
            }
          }
        } else {
          if (isCircle) {
            marker.setStyle({
              radius: 6,
              fillColor: (marker as any).originalColor || '#fbbf24',
              color: '#000',
              weight: 1,
              opacity: 1,
              fillOpacity: 0.9
            });
          }
          if (isBadge) {
            marker.setOpacity(1);
          }
        }
      });
    });
  }, [hoveredCity]);

  const [showLegend, setShowLegend] = useState(false);

  const rankingData = useMemo(() => {
    const cityCounts: Record<string, number> = {};
    let total = 0;

    pareceres.forEach(p => {
      const isConcluido = p.status === 'Concluído';
      if (isConcluido && !activeFilters.has('parecerConcluido')) return;
      if (!isConcluido && !activeFilters.has('parecerRascunho')) return;
      if (p.municipio) {
        cityCounts[p.municipio] = (cityCounts[p.municipio] || 0) + 1;
        total++;
      }
    });

    oficios.forEach(o => {
      const situacao = o.situacaoCumprimento;
      if (situacao === 'Pendente' && !activeFilters.has('oficioPendente')) return;
      if (situacao === 'Não cumprido no prazo' && !activeFilters.has('oficioExpirado')) return;
      if (situacao === 'Cumprido' && !activeFilters.has('oficioCumprido')) return;
      if (situacao === 'Arquivado' && !activeFilters.has('oficioArquivado')) return;
      const muni = (o as any).municipio;
      if (muni) {
        cityCounts[muni] = (cityCounts[muni] || 0) + 1;
        total++;
      }
    });

    notificacoes.forEach(n => {
      const isAntiga = (n as any).origem === 'Antiga';
      if (isAntiga) {
        const isAtendida = n.atendida === 'SIM';
        if (isAtendida && !activeFilters.has('notificacaoAntigaAtendida')) return;
        if (!isAtendida && !activeFilters.has('notificacaoAntigaPendente')) return;
      } else {
        const situacao = n.situacao || 'Em aberto';
        if (situacao === 'Em aberto' && !activeFilters.has('notificacaoAberto')) return;
        if (situacao === 'Cumprida' && !activeFilters.has('notificacaoCumprida')) return;
        if (situacao === 'Não cumprida no prazo' && !activeFilters.has('notificacaoAtrasada')) return;
        if (situacao === 'Arquivada' && !activeFilters.has('notificacaoArquivada')) return;
      }
      const muni = n.municipioEmpreendimento || (n as any).municipio;
      if (muni) {
        cityCounts[muni] = (cityCounts[muni] || 0) + 1;
        total++;
      }
    });

    snisbData.forEach(s => {
      if (!activeFilters.has('snisb')) return;
      if (s.municipio) {
        cityCounts[s.municipio] = (cityCounts[s.municipio] || 0) + 1;
        total++;
      }
    });

    aneelData.forEach(s => {
      if (!activeFilters.has('aneel')) return;
      if (s.municipio) {
        cityCounts[s.municipio] = (cityCounts[s.municipio] || 0) + 1;
        total++;
      }
    });

    return Object.entries(cityCounts)
      .map(([name, count]) => ({
        name,
        count,
        percent: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [pareceres, oficios, notificacoes, snisbData, activeFilters]);

  return (
    <div className="flex w-full h-full gap-4 group">
      <div className="relative flex-1 h-full min-w-0">
        <div ref={mapRef} className="w-full h-full rounded-xl z-0 border border-slate-200 shadow-inner" />
        
        <div className={`
          absolute bottom-4 left-4 z-[1000] transition-all duration-500 ease-in-out
          ${showLegend ? 'translate-y-0 opacity-100' : 'translate-y-2 md:translate-y-0 opacity-0 md:opacity-100 pointer-events-none md:pointer-events-auto'}
        `}>
          <div className="bg-white/95 backdrop-blur-md p-3 rounded-xl shadow-2xl border border-slate-200 text-[9px] font-bold text-slate-600 uppercase tracking-widest space-y-2.5 min-w-[160px]">
            <div className="border-b border-slate-100 pb-1.5 mb-1 text-slate-400 font-black flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapIcon size={10} className="text-blue-500" />
                Legenda
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={selectAll}
                  className="text-[7px] text-emerald-600 hover:text-emerald-700 uppercase tracking-tighter border border-emerald-100 px-1 rounded bg-emerald-50/50"
                  title="Selecionar Todos"
                >
                  Tudo
                </button>
                <button 
                  onClick={deselectAll}
                  className="text-[7px] text-rose-600 hover:text-rose-700 uppercase tracking-tighter border border-rose-100 px-1 rounded bg-rose-50/50"
                  title="Desselecionar Todos"
                >
                  Nada
                </button>
                <button onClick={() => setShowLegend(false)} className="md:hidden text-slate-300 hover:text-slate-600">
                  <X size={12} />
                </button>
              </div>
            </div>
            
            <div className="space-y-2">
              {!isNotificationControl && (
                <>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('parecerRascunho')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('parecerRascunho')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm" style={{ backgroundColor: '#87CEEB' }}></div>
                    <span>Parecer (Rascunho)</span>
                  </div>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('parecerConcluido')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('parecerConcluido')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm" style={{ backgroundColor: '#0000CD' }}></div>
                    <span>Parecer (Concluído)</span>
                  </div>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('oficioPendente')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('oficioPendente')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm" style={{ backgroundColor: '#FBBF24' }}></div>
                    <span>Ofício (Pendente)</span>
                  </div>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('oficioExpirado')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('oficioExpirado')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm" style={{ backgroundColor: '#EF4444' }}></div>
                    <span>Ofício (Expirado)</span>
                  </div>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('oficioCumprido')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('oficioCumprido')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm" style={{ background: 'repeating-linear-gradient(45deg, #fbbf24, #fbbf24 2px, #10b981 2px, #10b981 4px)' }}></div>
                    <span>Ofício (Cumprido)</span>
                  </div>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('oficioArquivado')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('oficioArquivado')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm" style={{ backgroundColor: '#94A3B8' }}></div>
                    <span>Ofício (Arquivado)</span>
                  </div>
                  
                  <div className="pt-1 border-t border-slate-100 mt-1"></div>
                </>
              )}
              
              <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('notificacaoAberto')}>
                <input 
                  type="checkbox" 
                  checked={activeFilters.has('notificacaoAberto')} 
                  onChange={() => {}} 
                  className="w-2.5 h-2.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <div className="w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm flex items-center justify-center text-[6px] text-white font-bold" style={{ backgroundColor: '#7B3FE4' }}>!</div>
                <span>Notif. (Em aberto)</span>
              </div>
              <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('notificacaoCumprida')}>
                <input 
                  type="checkbox" 
                  checked={activeFilters.has('notificacaoCumprida')} 
                  onChange={() => {}} 
                  className="w-2.5 h-2.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <div className="w-2.5 h-2.5 rounded-full border border-[#7B3FE4] shadow-sm flex items-center justify-center text-[6px] text-[#7B3FE4] font-bold" style={{ backgroundColor: '#FFFFFF' }}>✓</div>
                <span>Notif. (Cumprida)</span>
              </div>
              <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('notificacaoAtrasada')}>
                <input 
                  type="checkbox" 
                  checked={activeFilters.has('notificacaoAtrasada')} 
                  onChange={() => {}} 
                  className="w-2.5 h-2.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <div className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#FF9800] shadow-sm">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#7B3FE4] flex items-center justify-center text-[7px] text-white font-black leading-none border border-white/20">!</div>
                </div>
                <span className="ml-1">Notif. (Atrasada)</span>
              </div>
              <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('notificacaoArquivada')}>
                <input 
                  type="checkbox" 
                  checked={activeFilters.has('notificacaoArquivada')} 
                  onChange={() => {}} 
                  className="w-2.5 h-2.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <div className="w-2.5 h-2.5 rounded-full border border-black/40 shadow-sm flex items-center justify-center text-[6px] text-white font-bold" style={{ backgroundColor: '#9C8ACF' }}>📁</div>
                <span>Notif. (Arquivada)</span>
              </div>
              {isNotificationControl && (
                <>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('notificacaoAntigaPendente')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('notificacaoAntigaPendente')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div style={{
                      width: 0, 
                      height: 0, 
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '10px solid #FBBF24',
                      position: 'relative'
                    }}>
                      <span style={{ position: 'absolute', top: '2px', left: '50%', transform: 'translateX(-50%)', color: '#FF0000', fontSize: '7px', fontWeight: '900' }}>!</span>
                    </div>
                    <span>Notif. Antiga (Pendente)</span>
                  </div>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('notificacaoAntigaAtendida')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('notificacaoAntigaAtendida')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div style={{
                      width: 0, 
                      height: 0, 
                      borderLeft: '6px solid transparent',
                      borderRight: '6px solid transparent',
                      borderBottom: '10px solid #FBBF24',
                      position: 'relative'
                    }}>
                      <span style={{ position: 'absolute', top: '2px', left: '50%', transform: 'translateX(-50%)', color: '#10b981', fontSize: '7px', fontWeight: '900' }}>V</span>
                    </div>
                    <span>Notif. Antiga (Atendida)</span>
                  </div>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('snisb')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('snisb')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-sky-400 focus:ring-sky-500"
                    />
                    <div className="w-2.5 h-2.5 rounded-full border border-[#1D4ED8] shadow-sm" style={{ backgroundColor: '#60A5FA', opacity: 0.8 }}></div>
                    <span>Cadastradas no SNISB</span>
                  </div>
                  <div className="flex items-center gap-2.5 group/item cursor-pointer" onClick={() => toggleFilter('aneel')}>
                    <input 
                      type="checkbox" 
                      checked={activeFilters.has('aneel')} 
                      onChange={() => {}} 
                      className="w-2.5 h-2.5 rounded border-slate-300 text-emerald-400 focus:ring-emerald-500"
                    />
                    <div className="w-2.5 h-2.5 rounded-full border border-[#059669] shadow-sm" style={{ backgroundColor: '#10B981', opacity: 0.8 }}></div>
                    <span>Cadastradas na ANEEL</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => setShowLegend(!showLegend)}
          className="md:hidden absolute bottom-4 right-4 z-[1000] bg-white p-2 rounded-full shadow-lg border border-slate-200 text-slate-600"
        >
          <MapIcon size={20} />
        </button>

        {mouseGMS && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
            <div className="bg-slate-900/60 backdrop-blur-sm px-2 py-1 rounded-md border border-white/10 shadow-lg">
              <span className="text-[9px] font-mono font-bold text-white/90 tracking-tight whitespace-nowrap">
                {mouseGMS}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Ranking Sidebar */}
      <div className={`
        hidden lg:flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 ease-in-out relative
        ${isSidebarCollapsed ? 'w-12' : 'w-64'}
      `}>
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="absolute top-3 right-2 z-20 p-1 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-500 transition-colors"
          >
            {isSidebarCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>

          <div className={`p-3 border-b border-slate-100 bg-slate-50/50 ${isSidebarCollapsed ? 'opacity-0' : 'opacity-100'} transition-opacity`}>
            <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <div className="w-1.5 h-3 bg-emerald-500 rounded-full"></div>
              {!isSidebarCollapsed && "Ranking por Município"}
            </h4>
          </div>
          
          {!isSidebarCollapsed && (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10 shadow-sm">
                  <tr className="border-b border-slate-50">
                    <th className="px-3 py-2 text-[8px] font-black text-slate-400 uppercase tracking-widest">Cidade</th>
                    <th className="px-3 py-2 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">Qtd</th>
                    <th className="px-3 py-2 text-[8px] font-black text-slate-400 uppercase tracking-widest text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {rankingData.map((city, idx) => (
                    <tr 
                      key={city.name} 
                      onMouseEnter={() => setHoveredCity?.(city.name)}
                      onMouseLeave={() => setHoveredCity?.(null)}
                      onClick={() => {
                        const cityMarkers = markersRef.current[city.name];
                        if (leafletMap.current) {
                          // Zoom to markers if they exist
                          if (cityMarkers && cityMarkers.length > 0) {
                            const group = L.featureGroup(cityMarkers as any);
                            leafletMap.current.fitBounds(group.getBounds(), { padding: [50, 50], maxZoom: 12 });
                            
                            const firstCircle = cityMarkers.find(m => m instanceof L.CircleMarker);
                            if (firstCircle) {
                              firstCircle.openPopup();
                            }
                          }
                          
                          // Highlight and zoom to boundary if geojson exists
                          if (geoJsonLayerRef.current) {
                            const geoJson = geoJsonLayerRef.current as L.GeoJSON;
                            geoJson.eachLayer((layer: any) => {
                              if (layer.feature?.properties?.name?.toUpperCase() === city.name.toUpperCase()) {
                                if (!cityMarkers || cityMarkers.length === 0) {
                                  leafletMap.current?.fitBounds(layer.getBounds());
                                }
                                layer.setStyle({
                                  fillOpacity: 0.3,
                                  weight: 3,
                                  color: '#f59e0b'
                                });
                                setTimeout(() => {
                                  layer.setStyle({
                                    fillOpacity: 0.05,
                                    weight: 1,
                                    color: 'rgba(255, 255, 255, 0.5)'
                                  });
                                }, 3000);
                              }
                            });
                          }
                        }
                      }}
                      className={`
                        hover:bg-slate-50 transition-colors cursor-pointer group
                        ${hoveredCity === city.name ? 'bg-amber-50' : ''}
                      `}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold text-slate-400 w-3">{idx + 1}</span>
                          <span className="text-[10px] font-black text-slate-700 truncate max-w-[100px]" title={city.name}>
                            {city.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-[10px] font-black text-slate-900">{city.count}</span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-bold text-emerald-600">{city.percent.toFixed(1)}%</span>
                          <div className="w-12 h-1 bg-slate-100 rounded-full mt-0.5 overflow-hidden">
                            <div 
                              className="h-full bg-emerald-500 rounded-full" 
                              style={{ width: `${city.percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rankingData.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-[10px] font-bold text-slate-400 italic">
                        Nenhum dado disponível
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
});

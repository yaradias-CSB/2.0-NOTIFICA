import React, { useContext, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  Database,
  Loader2,
  MapPin,
  Search,
  WifiOff,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { EcosystemContext } from '../../contexts/EcosystemContext';
import {
  CoordinateLookupResult,
  lookupDataByCoordinates,
  MatchedExistingCadastro,
  matchMunicipioMT,
  PublicCarFeature,
} from '../../services/carLookupService';

interface CarCoordinateLookupProps {
  rawLat: string | number;
  rawLong: string | number;
  disabled?: boolean;
  onApplyCar: (car: PublicCarFeature) => void;
  onApplyCadastro: (cadastro: MatchedExistingCadastro, primaryCar?: PublicCarFeature) => void;
}

export const CarCoordinateLookup: React.FC<CarCoordinateLookupProps> = ({
  rawLat,
  rawLong,
  disabled = false,
  onApplyCar,
  onApplyCadastro,
}) => {
  const { empreendedores, barragens } = useContext(EcosystemContext);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoordinateLookupResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSearch = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.error('Sem conexão com a internet para consultar a base pública da SEMA/MT.');
      return;
    }

    setLoading(true);
    setIsOpen(true);
    try {
      const res = await lookupDataByCoordinates({
        rawLat,
        rawLong,
        empreendedores,
        barragens,
      });
      setResult(res);

      if (res.error) {
        toast.warning(res.error);
      } else if (res.carFeatures.length > 0 || res.matchedCadastros.length > 0) {
        toast.success(
          `Consulta concluída: ${res.carFeatures.length} CAR/MT e ${res.matchedCadastros.length} cadastro(s) localizado(s).`
        );
      } else {
        toast.info('Nenhum CAR/MT ou cadastro encontrado exatamente nesta coordenada.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1.5">
          <Compass size={13} className="text-emerald-600 shrink-0" />
          Com internet ativa, consulte a base pública da SEMA/MT (SICAR-MT) a partir das coordenadas informadas:
        </span>
        {!disabled && (
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            <span>{loading ? 'Consultando Base SEMA/MT...' : 'Buscar Dados (SEMA/MT)'}</span>
          </button>
        )}
      </div>

      {isOpen && result && (
        <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
          <div className="flex items-center justify-between gap-2 border-b border-emerald-200/70 pb-2.5">
            <div className="flex items-center gap-2">
              {result.online ? (
                <MapPin size={15} className="text-emerald-600" />
              ) : (
                <WifiOff size={15} className="text-rose-500" />
              )}
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Retorno da Consulta Georreferenciada (SEMA/MT)
              </span>
              {result.decimalCoords && (
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  {result.decimalCoords.lat.toFixed(5)}, {result.decimalCoords.lng.toFixed(5)}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              aria-label="Fechar resultados"
            >
              <X size={15} />
            </button>
          </div>

          {result.error && result.carFeatures.length === 0 && result.matchedCadastros.length === 0 && (
            <p className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              {result.error}
            </p>
          )}

          {/* CAR/MT polygons returned */}
          {result.carFeatures.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                CAR/MT Identificado na Coordenada ({result.carFeatures.length})
              </p>
              <div className="grid grid-cols-1 gap-2">
                {result.carFeatures.map((car) => (
                  <div
                    key={car.codigoCar}
                    className="p-3.5 rounded-xl bg-white border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black font-mono text-slate-900 break-all">
                          {car.codigoCar}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase">
                          {car.statusLabel}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-600">
                        Município: <strong>{matchMunicipioMT(car.municipio) || '---'}/{car.uf}</strong> • Área:{' '}
                        <strong>{car.areaHa.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ha</strong>{' '}
                        ({car.tipoImovelLabel})
                      </p>
                      {car.condicao && (
                        <p className="text-[10px] text-slate-500">{car.condicao}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyCar(car);
                        toast.success(
                          `CAR/MT ${car.codigoCar} aplicado ao formulário. Todos os campos permanecem editáveis.`
                        );
                      }}
                      className="shrink-0 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 size={13} />
                      <span>Utilizar CAR/MT</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Existing registered data matched */}
          {result.matchedCadastros.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-blue-900 flex items-center gap-1.5">
                <Database size={12} className="text-blue-600" />
                Dados já Cadastrados Relacionados ({result.matchedCadastros.length})
              </p>
              <div className="grid grid-cols-1 gap-2">
                {result.matchedCadastros.map((cad) => (
                  <div
                    key={cad.id}
                    className="p-3.5 rounded-xl bg-white border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-black uppercase">
                          {cad.sourceLabel}
                        </span>
                        {cad.distanceKm !== undefined && (
                          <span className="text-[10px] font-bold text-slate-500">
                            ~{cad.distanceKm} km da coordenada
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-black text-slate-900 truncate">
                        {cad.empreendedorNome || cad.nomeBarragem || 'Registro localizado'}
                        {cad.cpfCnpj ? ` • ${cad.cpfCnpj}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-600">
                        {cad.nomeBarragem ? `Empreendimento: ${cad.nomeBarragem} • ` : ''}
                        {cad.municipio ? `${cad.municipio}/MT` : ''}
                        {cad.carMt ? ` • CAR: ${cad.carMt}` : ''}
                        {cad.codigoSnisb ? ` • SNISB: ${cad.codigoSnisb}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onApplyCadastro(cad, result.carFeatures[0]);
                        toast.success(
                          'Dados preenchidos no formulário. Você pode editar qualquer campo e salvar a versão atualizada.'
                        );
                      }}
                      className="shrink-0 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 size={13} />
                      <span>Utilizar Dados</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!result.error &&
            result.carFeatures.length === 0 &&
            result.matchedCadastros.length === 0 && (
              <p className="text-xs text-slate-600">
                Nenhum imóvel CAR/MT ou cadastro encontrado exatamente nesta coordenada. Você pode continuar preenchendo manualmente.
              </p>
            )}
        </div>
      )}
    </div>
  );
};

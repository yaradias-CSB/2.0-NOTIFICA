import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  FileText, Download, RefreshCw, Layers, CheckCircle2, 
  AlertCircle, Loader2, Compass, MapPin, Eye, FileDown
} from 'lucide-react';
import { toast } from 'sonner';
import { NotificacaoData, BarragemCoordenada } from '../types';
import { SEMA_MT, CSB_SURH } from '../constants';
import { CABECALHO_SEMA_BASE64 } from '../assets/novoCabecalhoBase64';
import { generateSatelliteFrame, SatelliteFrameResult } from '../services/satelliteCaptureService';
import { generateRelatorioTecnicoDoc, DamImageItem } from '../services/docxService';

interface RelatorioTecnicoSectionProps {
  formData: NotificacaoData;
  readOnly?: boolean;
}

export const RelatorioTecnicoSection: React.FC<RelatorioTecnicoSectionProps> = ({
  formData,
  readOnly = false,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const [generatedFrames, setGeneratedFrames] = useState<SatelliteFrameResult[]>([]);
  const [lastGeneratedAt, setLastGeneratedAt] = useState<string | null>(null);

  // Lista normalizada de barragens com coordenadas
  const activeBarragensList = useMemo(() => {
    if (formData.barragens && formData.barragens.length > 0) {
      return formData.barragens;
    }
    if (formData.lat || formData.long) {
      return [{
        id: '1',
        nome: 'Barragem 1',
        lat: formData.lat || '',
        long: formData.long || ''
      }];
    }
    return [];
  }, [formData.barragens, formData.lat, formData.long]);

  // Função para gerar as imagens de satélite para todas as barragens registradas
  const handleGenerateSatelliteImages = async () => {
    if (activeBarragensList.length === 0) {
      toast.warning('Nenhuma coordenada de barragem disponível para captura de satélite.');
      setGeneratedFrames([]);
      return;
    }

    setIsGenerating(true);
    const toastId = toast.loading('Gerando imagens de satélite em alta resolução com enquadramento próprio...');

    try {
      const results: SatelliteFrameResult[] = [];

      for (let i = 0; i < activeBarragensList.length; i++) {
        const b = activeBarragensList[i];
        const res = await generateSatelliteFrame({
          lat: b.lat,
          long: b.long,
          damIndex: i + 1,
          damName: b.nome || `Barragem ${i + 1}`,
          municipio: formData.municipioEmpreendimento || 'Mato Grosso',
          zoom: 16,
          width: 760,
          height: 460
        });
        results.push(res);
      }

      setGeneratedFrames(results);
      const now = new Date();
      setLastGeneratedAt(`${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`);
      toast.success(`${results.length} imagem(ns) de satélite gerada(s) com sucesso!`, { id: toastId });
    } catch (err: any) {
      console.error('Erro na geração de imagens de satélite:', err);
      toast.error(`Falha ao gerar imagens de satélite: ${err?.message || 'Erro desconhecido'}`, { id: toastId });
    } finally {
      setIsGenerating(false);
    }
  };

  // Re-gera automaticamente quando a lista de coordenadas ou ordem das barragens mudar
  const coordsKey = useMemo(() => {
    return activeBarragensList
      .map((b, idx) => `${idx}:${b.lat}:${b.long}:${b.nome}`)
      .join('|');
  }, [activeBarragensList]);

  useEffect(() => {
    handleGenerateSatelliteImages();
  }, [coordsKey]);

  // Exportação DOCX com os mesmos dados e imagens da prévia
  const handleDownloadDocx = async () => {
    setIsExportingDocx(true);
    const toastId = toast.loading('Compilando Relatório Técnico oficial em formato DOCX...');

    try {
      const damImagesPayload: DamImageItem[] = activeBarragensList.map((b, idx) => {
        const frame = generatedFrames[idx];
        return {
          damIndex: idx + 1,
          nome: b.nome || `Barragem ${idx + 1}`,
          lat: b.lat || "00°00'00,00\"",
          long: b.long || "00°00'00,00\"",
          dataUrl: frame?.dataUrl || '',
          scaleMeters: frame?.scaleMeters,
          timestamp: frame?.timestamp
        };
      });

      await generateRelatorioTecnicoDoc(formData, damImagesPayload);
      toast.success('Documento DOCX gerado e baixado com sucesso!', { id: toastId });
    } catch (err: any) {
      console.error('Erro ao gerar DOCX:', err);
      toast.error(`Falha na exportação do DOCX: ${err?.message || 'Verifique os dados'}`, { id: toastId });
    } finally {
      setIsExportingDocx(false);
    }
  };

  // Metadados do relatório formatados
  const dataExtenso = useMemo(() => {
    const d = formData.dataNotificacao ? new Date(formData.dataNotificacao + 'T12:00:00') : new Date();
    if (isNaN(d.getTime())) return new Date().toLocaleDateString('pt-BR');
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
  }, [formData.dataNotificacao]);

  const analistasList = (formData.analistas && formData.analistas.length > 0)
    ? formData.analistas
    : ['Analista de Meio Ambiente / Fiscalizador'];

  return (
    <div className="space-y-6">
      {/* Barra de Ações Superior do Tópico 6 */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              Documento Oficial
            </span>
            <span className="text-xs text-slate-400">
              Modelo Institucional SEMA-MT / CSB-SURH
            </span>
          </div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="text-emerald-400" size={20} />
            Tópico 6 — Relatório Técnico de Fiscalização Remota
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Prévia paginada em layout A4 com enquadramentos de satélite individuais, escala métrica, símbolo norte e download DOCX.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={handleGenerateSatelliteImages}
            disabled={isGenerating}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            title="Atualizar captura de satélite das coordenadas"
          >
            <RefreshCw size={14} className={isGenerating ? 'animate-spin text-emerald-400' : ''} />
            {isGenerating ? 'Gerando Imagens...' : 'Atualizar Imagens'}
          </button>

          <button
            onClick={handleDownloadDocx}
            disabled={isExportingDocx || isGenerating}
            className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 disabled:opacity-50"
          >
            {isExportingDocx ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <FileDown size={16} />
            )}
            BAIXAR DOCX
          </button>
        </div>
      </div>

      {/* Indicador de Status das Imagens */}
      <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-xl">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-emerald-600" />
          <span>
            <strong>{activeBarragensList.length}</strong> barragem(ns) configurada(s) no formulário
            {generatedFrames.length > 0 && ` • ${generatedFrames.filter(f => !f.error && f.dataUrl).length} enquadramento(s) pronto(s)`}
          </span>
        </div>
        {lastGeneratedAt && (
          <span className="text-slate-400">
            Última renderização da prévia: {lastGeneratedAt}
          </span>
        )}
      </div>

      {/* PRÉVIA PAGINADA A4 */}
      <div className="bg-slate-200/70 p-4 md:p-8 rounded-2xl border border-slate-300 overflow-x-auto shadow-inner">
        <div className="w-[210mm] min-h-[297mm] bg-white text-slate-800 shadow-2xl mx-auto border border-slate-300 p-[20mm] relative flex flex-col justify-between font-sans leading-normal print:shadow-none print:m-0 print:border-none">
          {/* Cabeçalho Institucional Oficial SEMA/MT */}
          <div>
            <div className="w-full mb-6">
              <img 
                src={CABECALHO_SEMA_BASE64} 
                alt="SEMA - Governo do Estado de Mato Grosso" 
                className="w-full h-auto object-contain block"
              />
            </div>

            {/* Título do Relatório */}
            <div className="text-center my-6 bg-slate-50 border border-slate-200 py-3 px-4 rounded-lg">
              <h2 className="text-base font-extrabold text-emerald-800 tracking-wide uppercase">
                RELATÓRIO TÉCNICO DE FISCALIZAÇÃO REMOTA
              </h2>
              <p className="text-xs font-semibold text-slate-600 mt-0.5">
                PROCESSO SEMA-MT Nº {formData.numProcesso || '________'} • NOTIFICAÇÃO Nº {formData.notificacaoGerada || '____'}/CSB/SURH
              </p>
            </div>

            {/* 1. DADOS DE IDENTIFICAÇÃO DO PROCESSO E DO IMÓVEL */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-900 uppercase border-l-4 border-emerald-600 pl-2 mb-2 tracking-wide">
                1. DADOS DE IDENTIFICAÇÃO DO PROCESSO E DO IMÓVEL
              </h3>
              <table className="w-full text-xs border border-slate-300 border-collapse">
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-100 p-2 font-bold text-slate-700 w-1/3 border-r border-slate-200">
                      Processo Administrativo:
                    </td>
                    <td className="p-2 text-slate-800 font-medium">
                      {formData.numProcesso || 'Não informado'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-100 p-2 font-bold text-slate-700 border-r border-slate-200">
                      Notificado / Empreendedor:
                    </td>
                    <td className="p-2 text-slate-800 font-medium">
                      {formData.empreendedorNome || 'Não informado'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-100 p-2 font-bold text-slate-700 border-r border-slate-200">
                      Documento ({formData.tipoDocumentoIdentificacao || 'CPF'}):
                    </td>
                    <td className="p-2 text-slate-800 font-medium">
                      {formData.documentoIdentificacao || 'Não informado'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-100 p-2 font-bold text-slate-700 border-r border-slate-200">
                      Cadastro Ambiental Rural (CAR/MT):
                    </td>
                    <td className="p-2 text-slate-800 font-medium">
                      {formData.carMt || 'Não informado'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-100 p-2 font-bold text-slate-700 border-r border-slate-200">
                      Propriedade / Empreendimento:
                    </td>
                    <td className="p-2 text-slate-800 font-medium">
                      {formData.nomeFantasia || formData.enderecoEmpreendimento || 'Propriedade Rural'}
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-100 p-2 font-bold text-slate-700 border-r border-slate-200">
                      Município de Localização:
                    </td>
                    <td className="p-2 text-slate-800 font-medium">
                      {formData.municipioEmpreendimento || 'Mato Grosso'} / MT
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="bg-slate-100 p-2 font-bold text-slate-700 border-r border-slate-200">
                      Endereço de Correspondência:
                    </td>
                    <td className="p-2 text-slate-800 font-medium">
                      {[
                        formData.logradouro,
                        formData.numero ? `nº ${formData.numero}` : '',
                        formData.bairro,
                        formData.municipioCorrespondencia ? `${formData.municipioCorrespondencia}/${formData.ufCorrespondencia || 'MT'}` : '',
                        formData.cepCorrespondencia ? `CEP: ${formData.cepCorrespondencia}` : ''
                      ].filter(Boolean).join(', ') || 'Não informado'}
                    </td>
                  </tr>
                  <tr>
                    <td className="bg-slate-100 p-2 font-bold text-slate-700 border-r border-slate-200">
                      Analista(s) Responsável(is):
                    </td>
                    <td className="p-2 text-slate-800 font-medium">
                      {analistasList.join('; ')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 2. OBJETIVO DA AÇÃO FISCALIZATÓRIA */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-900 uppercase border-l-4 border-emerald-600 pl-2 mb-2 tracking-wide">
                2. OBJETIVO DA AÇÃO FISCALIZATÓRIA REMOTA
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed text-justify">
                {formData.objetivo || "Notificação para o cadastro e a classificação do Dano Potencial Associado e Categoria de Risco, para barragens."}
              </p>
            </div>

            {/* 3. ANÁLISE GEORREFERENCIADA E VISTORIA REMOTA */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-900 uppercase border-l-4 border-emerald-600 pl-2 mb-2 tracking-wide">
                3. ANÁLISE GEORREFERENCIADA E VISTORIA REMOTA
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed text-justify mb-4">
                A partir da verificação técnica geoespacial realizada por meio de imagens orbitais de satélite de alta resolução e confronto com a base cartográfica oficial da SEMA/MT e do Cadastro Ambiental Rural (CAR/MT), foram identificadas estruturas de retenção hídrica/barramentos artificiais no perímetro do imóvel indicado.
              </p>

              {/* 3.1. Imagens de Satélite das Barragens Identificadas */}
              <div>
                <h4 className="text-xs font-bold text-emerald-800 uppercase mb-3 flex items-center gap-1.5">
                  <span>3.1. Imagens de Satélite das Barragens Identificadas</span>
                </h4>

                {isGenerating && (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl my-4">
                    <Loader2 size={32} className="animate-spin text-emerald-600 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">Gerando enquadramentos cartográficos de satélite...</p>
                    <p className="text-[11px] text-slate-500">Calculando escala métrica real e renderizando marcadores numerados</p>
                  </div>
                )}

                {!isGenerating && activeBarragensList.length === 0 && (
                  <div className="p-6 text-center bg-amber-50 border border-amber-200 rounded-xl my-4 text-xs text-amber-800">
                    <AlertCircle size={20} className="mx-auto mb-1 text-amber-600" />
                    Nenhuma barragem com coordenadas válidas informada no formulário. Adicione coordenadas no Tópico 2 para gerar os enquadramentos.
                  </div>
                )}

                {!isGenerating && activeBarragensList.map((barragem, index) => {
                  const frame = generatedFrames[index];
                  const hasImage = frame && frame.dataUrl && !frame.error;

                  return (
                    <div key={barragem.id || index} className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">
                            #{index + 1}
                          </span>
                          {barragem.nome || `Barragem ${index + 1}`}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          LAT: {barragem.lat || "00°00'00,00\""} S | LONG: {barragem.long || "00°00'00,00\""} O
                        </span>
                      </div>

                      {/* Imagem de Satélite Renderizada */}
                      <div className="relative rounded-lg overflow-hidden border border-slate-300 bg-slate-900 shadow">
                        {hasImage ? (
                          <img 
                            src={frame.dataUrl} 
                            alt={`Imagem de satélite da Barragem #${index + 1}`} 
                            className="w-full h-auto object-cover block"
                          />
                        ) : (
                          <div className="p-8 text-center text-xs text-slate-400">
                            {frame?.error ? (
                              <div className="text-rose-400">
                                <AlertCircle size={24} className="mx-auto mb-1 text-rose-400" />
                                {frame.error}
                              </div>
                            ) : (
                              'Enquadramento de satélite em processamento...'
                            )}
                          </div>
                        )}
                      </div>

                      {/* Legenda Oficial Conforme Modelo */}
                      <p className="text-[11px] text-center text-slate-600 italic mt-2">
                        <strong>Figura {index + 1}</strong> — Imagem de satélite da {barragem.nome || `Barragem ${index + 1}`} (Coordenadas: LAT {barragem.lat || "00°00'00,00\""} S | LONG {barragem.long || "00°00'00,00\""} O — {formData.municipioEmpreendimento || 'Mato Grosso'}/MT).
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. ENQUADRAMENTO TÉCNICO E FUNDAMENTAÇÃO LEGAL */}
            <div className="mb-6">
              <h3 className="text-xs font-bold text-slate-900 uppercase border-l-4 border-emerald-600 pl-2 mb-2 tracking-wide">
                4. ENQUADRAMENTO TÉCNICO E FUNDAMENTAÇÃO LEGAL
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed text-justify mb-2">
                A fiscalização de segurança de barragens de acumulação de água para usos múltiplos no Estado de Mato Grosso é regida pela Lei Federal nº 12.334/2010, Resolução CEHIDRO nº 163, de 18 de maio de 2023, e pela Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023.
              </p>
              <p className="text-xs text-slate-700 leading-relaxed text-justify mb-2">
                Considerando as características dos espelhos d’água identificados na imagem do Cadastro Ambiental Rural {formData.carMt || '<<CAR/MT>>'}, bem como as condições e características técnicas estabelecidas no art. 24 da Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023, para fins de verificação da necessidade de classificação e cadastro, será obrigatória a classificação de segurança de toda barragem em operação que apresente, no mínimo, as seguintes características:
              </p>
              <div className="bg-slate-50 border border-slate-200 rounded p-2.5 text-xs text-slate-700 space-y-1 mb-2">
                <p><strong>1 –</strong> Dano Potencial Associado (DPA) baixo;</p>
                <p><strong>2 –</strong> Altura do maciço, medida do ponto mais baixo do talude de jusante até o ponto mais alto da crista, maior ou igual a 3 m (três metros);</p>
                <p><strong>3 –</strong> Capacidade total do reservatório maior ou igual a 500.000 m³ (quinhentos mil metros cúbicos);</p>
                <p><strong>4 –</strong> Área de drenagem até o ponto do barramento maior ou igual a 2,0 km² (dois quilômetros quadrados).</p>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed text-justify mb-2">
                Ressalta-se que, em observância ao disposto no art. 24 da Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023, quanto aos critérios para a obrigatoriedade de classificação de segurança de barragens, caso as barragens existentes na referida propriedade não se enquadrem nos critérios previstos no referido artigo, deverão ser apresentadas informações suficientes para sua caracterização e para a comprovação da não obrigatoriedade de classificação.
              </p>
            </div>

            {/* 5. CONCLUSÃO E ENCAMINHAMENTO */}
            <div className="mb-8">
              <h3 className="text-xs font-bold text-slate-900 uppercase border-l-4 border-emerald-600 pl-2 mb-2 tracking-wide">
                5. CONCLUSÃO E ENCAMINHAMENTO
              </h3>
              <p className="text-xs text-slate-700 leading-relaxed text-justify">
                Diante da identificação dos barramentos supramencionados e em conformidade com as diretrizes da Política Nacional de Segurança de Barragens (PNSB), conclui-se pela emissão da Notificação Administrativa ao responsável pela área vinculada ao CAR/MT nº {formData.carMt || '________________'}, concedendo-se o prazo legal de <strong>{formData.prazoVencimento || '90'} dias corridos</strong> para o cumprimento das obrigações estabelecidas no respectivo instrumento noticiatório.
              </p>
            </div>

            {/* Data e Assinaturas */}
            <div className="mt-8 text-right text-xs text-slate-700 font-medium mb-12">
              Cuiabá/MT, {dataExtenso}.
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 text-center pt-6 border-t border-slate-200">
              {analistasList.map((analista, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="w-48 h-0.5 bg-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-900">{analista}</p>
                  <p className="text-[11px] text-slate-600">Analista de Meio Ambiente / Fiscalizador</p>
                  <p className="text-[10px] text-slate-500 font-medium">{CSB_SURH} — SEMA/MT</p>
                </div>
              ))}
            </div>
          </div>

          {/* Rodapé Institucional Oficial da Página */}
          <div className="pt-6 border-t border-slate-300 text-[10px] text-slate-500 flex items-center justify-between mt-12">
            <div>
              <p className="font-semibold text-slate-700">SEMA-MT • Coordenadoria de Segurança de Barragens • CSB/SURH</p>
              <p>Rua C, s/n, Centro Político Administrativo • CEP 78049-913 • Cuiabá/MT</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-700">Página 1 de 1</p>
              <p>Relatório Técnico Oficial</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RelatorioTecnicoSection;

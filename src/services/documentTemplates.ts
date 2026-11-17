import {
  BarragemCoordenada,
  CoordenadaGMS,
  CoordenadasGMS,
  NotificacaoData,
  OficioData,
  ParecerData,
} from '../types';

export function gmsCoordToString(c?: CoordenadaGMS | null): string {
  if (!c) return '';
  const g = (c.g || '').trim();
  const m = (c.m || '').trim();
  const s = (c.s || '').trim();
  if (!g && !m && !s) return '';
  return `${g || '00'}°${m || '00'}'${s || '00'}"`;
}

export function stringToCoordenadaGMS(raw?: string | null): CoordenadaGMS {
  if (!raw) return { g: '', m: '', s: '' };
  const cleaned = String(raw).trim();
  const match = cleaned.match(/(\d{1,3})\s*[°º]?\s*(\d{1,2})?\s*['’]?\s*([\d.,]+)?/);
  if (match && cleaned.includes('°')) {
    return {
      g: match[1] || '',
      m: match[2] || '',
      s: match[3] || '',
    };
  }
  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return { g: '', m: '', s: '' };
  const g = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const s =
    digits.length > 4
      ? digits.slice(4, 6) + (digits.length > 6 ? ',' + digits.slice(6, 8) : '')
      : '';
  return { g, m, s };
}

export function coordenadasGmsToStrings(coords?: CoordenadasGMS | null): { lat: string; long: string } {
  return {
    lat: gmsCoordToString(coords?.lat),
    long: gmsCoordToString(coords?.long),
  };
}

export function stringsToCoordenadasGms(lat?: string, long?: string): CoordenadasGMS {
  return {
    lat: stringToCoordenadaGMS(lat),
    long: stringToCoordenadaGMS(long),
  };
}

export function formatGmsPair(coords?: CoordenadasGMS | null): string {
  const latStr = gmsCoordToString(coords?.lat) || '___';
  const longStr = gmsCoordToString(coords?.long) || '___';
  return `Lat: ${latStr} | Long: ${longStr}`;
}

export function formatBarragensSummary(barragens?: BarragemCoordenada[]): string {
  if (!Array.isArray(barragens) || barragens.length === 0) return '';
  return barragens
    .map((b, idx) => {
      const nome = (b.nome || `Barragem ${idx + 1}`).replace(/[|;]/g, ' ').trim();
      const snisb = (b.codigoSnisb || '').replace(/[|;]/g, ' ').trim();
      const lat = (b.lat || '').replace(/[|;]/g, ' ').trim();
      const long = (b.long || '').replace(/[|;]/g, ' ').trim();
      return snisb
        ? `${idx + 1}. ${nome} | ${lat} | ${long} | SNISB:${snisb}`
        : `${idx + 1}. ${nome} | ${lat} | ${long}`;
    })
    .join('; ');
}

export function parseBarragensSummary(
  summary?: string,
  latFallback?: string,
  longFallback?: string,
  barragemIdsCsv?: string,
  primaryNome?: string
): BarragemCoordenada[] {
  const ids = (barragemIdsCsv || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (summary && summary.trim()) {
    const parts = summary
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);
    const parsed: BarragemCoordenada[] = [];
    parts.forEach((part, idx) => {
      const cols = part.split('|').map((c) => c.trim());
      const rawName = (cols[0] || `Barragem ${idx + 1}`).replace(/^\d+\.\s*/, '').trim();
      const lat = cols[1] || '';
      const long = cols[2] || '';
      const snisbCol = cols.find((c) => c.startsWith('SNISB:'));
      parsed.push({
        id: ids[idx] || `bar_${idx + 1}`,
        barragemId: ids[idx] || undefined,
        nome: rawName || `Barragem ${idx + 1}`,
        lat,
        long,
        codigoSnisb: snisbCol ? snisbCol.replace('SNISB:', '').trim() : undefined,
      });
    });
    if (parsed.length > 0) return parsed;
  }

  if (latFallback || longFallback || primaryNome || ids[0]) {
    return [
      {
        id: ids[0] || 'bar_1',
        barragemId: ids[0] || undefined,
        nome: primaryNome || 'Barragem 1',
        lat: latFallback || '',
        long: longFallback || '',
      },
    ];
  }

  return [];
}

function formatPtBrDate(dateStr?: string): string {
  if (!dateStr) return new Date().toLocaleDateString('pt-BR');
  const parsed = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('pt-BR');
  }
  return dateStr;
}

function formatPtBrDateExtenso(dateStr?: string): string {
  const parsed = dateStr
    ? new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`)
    : new Date();
  const target = isNaN(parsed.getTime()) ? new Date() : parsed;
  return target.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function buildNotificacaoText(data: Partial<NotificacaoData>): string {
  const formattedDate = formatPtBrDate(data.dataNotificacao);
  const analistas = Array.isArray(data.analistas) ? data.analistas.filter(Boolean) : [];
  const analystsText = analistas.length > 0 ? `\n\n${analistas.join('\n')}` : '';

  const activeBarragens =
    Array.isArray(data.barragens) && data.barragens.length > 0
      ? data.barragens
      : [{ id: '1', nome: data.nomeFantasia || 'Barragem 1', lat: data.lat || '', long: data.long || '' }];

  const empreendedorNome = data.empreendedorNome || '________________';
  const tipoDoc = data.tipoDocumentoIdentificacao || 'CPF';
  const docNum = data.documentoIdentificacao || '________________';
  const carMt = data.carMt || '________________';
  const municipio = data.municipioEmpreendimento || '________________';
  const prazo = data.prazoVencimento || '90';

  let solicitacaoItemI = '';
  if (activeBarragens.length > 1) {
    const coordsList = activeBarragens
      .map((b, idx) => {
        const bLat = b.lat || "00°00'00,00\"";
        const bLong = b.long || "00°00'00,00\"";
        const label = b.nome ? ` (${b.nome})` : '';
        return `${idx + 1}. LAT ${bLat} S e LONG ${bLong} O${label},`;
      })
      .join('\n\n');

    solicitacaoItemI = `I. Notificamos ${empreendedorNome} de ${tipoDoc} ${docNum}, responsável pela área vinculada ao CAR/MT nº ${carMt}, a providenciar a classificação de segurança por meio de cadastro e classificação das barragens localizadas no município de ${municipio}, nas coordenadas:\n\n${coordsList}\n\nem conformidade com o enquadramento estabelecido na legislação vigente, considerando o que dispõe a Lei nº 12.334, a Resolução CEHIDRO nº 163 de 18 de maio de 2023, a Instrução Normativa nº 08 de 18 de dezembro de 2023 e o Termo de Referência nº 17, disponíveis no sítio eletrônico da SEMA/MT; prazo para atendimento das solicitações: ${prazo} dias;`;
  } else {
    const bLat = activeBarragens[0]?.lat || data.lat || "00°00'00,00\"";
    const bLong = activeBarragens[0]?.long || data.long || "00°00'00,00\"";
    solicitacaoItemI = `I. Notificamos ${empreendedorNome} de ${tipoDoc} ${docNum}, responsável pela área vinculada ao CAR/MT nº ${carMt}, a providenciar a classificação de segurança por meio de cadastro e classificação da barragem localizada no município de ${municipio}, utilizando como coordenada de referência (sede ou barragem) LAT ${bLat} S e LONG ${bLong} O, em conformidade com o enquadramento estabelecido na legislação vigente, considerando o que dispõe a Lei nº 12.334, a Resolução CEHIDRO nº 163 de 18 de maio de 2023, a Instrução Normativa nº 08 de 18 de dezembro de 2023 e o Termo de Referência nº 17, disponíveis no sítio eletrônico da SEMA/MT; prazo para atendimento das solicitações: ${prazo} dias;`;
  }

  return `OBJETIVO:

${data.objetivo || 'Notificação para o cadastro e a classificação do Dano Potencial Associado e Categoria de Risco, para barragens.'}

SOLICITAÇÕES:

${solicitacaoItemI}

II. O não atendimento destas solicitações, no prazo estabelecido, acarretará as sanções administrativas cabíveis, nos termos da Lei nº 12.334, de 20 de setembro de 2010 e suas alterações, e da Resolução CNRH nº 230 de 22 de março de 2022.

INFORMAÇÕES GERAIS ORIENTATIVAS

I.\tCabe ressaltar que o empreendedor é responsável pela segurança da barragem, esteja ela submetida ou não à referida Lei, devendo zelar pela sua manutenção e operação, de maneira a reduzir a possibilidade de acidente e suas consequências;

II.\tA manutenção da barragem deve ser realizada conforme orientações apresentadas na Cartilha de Ações de Manutenção em Barragens de Terra. Disponível em: http://www.sema.mt.gov.br/site/phocadownload/SURH2/Cartilha%20de%20Aes%20de%20Manuteno%20em%20Barragens%20de%20Terra.pdf; e http://www.sema.mt.gov.br/site/index.php/unidades-administrativas/recursos-hidricos/category/394-seguran%C3%A7a-de-barragens.

III. Informações sobre Legislações e Normativas (base legal para segurança de barragens em MT) podem ser acessadas no SISB-MT (Sistema de Informações sobre Segurança de Barragens de Acumulação de água para Usos Múltiplos (exceto geração de energia) do Estado de Mato Grosso), no link https://sisb-mt-csb.vercel.app/#informacoes

IV. Considerando as características dos espelhos d’água identificados na imagem do Cadastro Ambiental Rural ${data.carMt || '<<CAR/MT>>'}, bem como as condições e características técnicas estabelecidas no art. 24 da Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023, para fins de verificação da necessidade de classificação e cadastro, será obrigatória a classificação de segurança de toda barragem em operação que apresente, no mínimo, as seguintes características:
1 – Dano Potencial Associado (DPA) baixo;
2 – Altura do maciço, medida do ponto mais baixo do talude de jusante até o ponto mais alto da crista, maior ou igual a 3 m (três metros);
3 – Capacidade total do reservatório maior ou igual a 500.000 m³ (quinhentos mil metros cúbicos);
4 – Área de drenagem até o ponto do barramento maior ou igual a 2,0 km² (dois quilômetros quadrados).
Ressalta-se que, em observância ao disposto no art. 24 da Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023, quanto aos critérios para a obrigatoriedade de classificação de segurança de barragens, caso as barragens existentes na referida propriedade não se enquadrem nos critérios previstos no referido artigo, deverão ser apresentadas informações suficientes para sua caracterização e para a comprovação da não obrigatoriedade de classificação.

Cuiabá/MT, ${formattedDate}.${analystsText}`;
}

export function buildNotificacaoSigaDocText(data: Partial<NotificacaoData>): string {
  const formattedDate = formatPtBrDate(data.dataNotificacao);
  const analistas = Array.isArray(data.analistas) ? data.analistas : [];
  const analystsNames = analistas.map((a) => String(a).split('/')[0].trim()).filter(Boolean).join(', ');

  const activeBarragens =
    Array.isArray(data.barragens) && data.barragens.length > 0
      ? data.barragens
      : [{ id: '1', nome: 'Barragem 1', lat: data.lat || '', long: data.long || '' }];

  const coordsRefText =
    activeBarragens.length > 1
      ? `nas coordenadas: ${activeBarragens
          .map((b, i) => `${i + 1}. LAT ${b.lat || "00°00'00,00\""} S e LONG ${b.long || "00°00'00,00\""} O`)
          .join('; ')}`
      : `com coordenada de referência (sede ou barragem) em LAT ${
          activeBarragens[0]?.lat || data.lat || "00°00'00,00\""
        } S e LONG ${activeBarragens[0]?.long || data.long || "00°00'00,00\""} O`;

  return `     Em cumprimento à Notificação nº ${data.notificacaoGerada || '____'}/CSB/SURH/SEMA-MT, emitida em ${formattedDate} por ${
    analystsNames || '________________'
  }, o(a) notificado(a) ${data.empreendedorNome || '________________'}, ${
    data.tipoDocumentoIdentificacao || 'CPF'
  } ${data.documentoIdentificacao || '________________'}, responsável pela área vinculada ao CAR/MT nº ${
    data.carMt || '________________'
  }, localizada em ${data.municipioEmpreendimento || '________________'}, ${coordsRefText}, fica ciente da obrigatoriedade de realizar o cadastro e a classificação da barragem, incluindo Dano Potencial Associado (DPA) e Categoria de Risco (CRI), e de apresentar a documentação técnica correspondente, nos termos da Lei nº 12.334/2010 e alterações, Resolução CEHIDRO nº 163/2023, Instrução Normativa nº 08/2023 e Termo de Referência nº 17, no prazo de ${
    data.prazoVencimento || '90'
  } dias.
     O não atendimento ao disposto na notificação, no prazo estabelecido, sujeitará o(a) notificado(a) às sanções administrativas previstas na Resolução CNRH nº 230 de 22 de março de 2022, sem prejuízo de outras responsabilizações.
     Cuiabá/MT, ${formattedDate}.`;
}

export function buildOficioCorpoText(data: Partial<OficioData>): string {
  const tipo = data.tipo_documento || '1° Oficio de Pendencias';
  const numOficio = data.protocolo || '____';
  const processoRef = data.processo || data.protocolo || '____';
  const interessado = data.interessado || '____________________';
  const cpfCnpj = data.cpfCnpj ? ` (${data.cpfCnpj})` : '';
  const empreendimento = data.empreendimento || '____________________';
  const municipio = data.municipio || data.cidadeUf || '___/MT';
  const coords = formatGmsPair(data.coordenadasGMS);
  const rts = [
    ...(data.responsaveisTecnicos || []),
    ...(data.rtOutros || []).filter((x) => x && x.trim()),
  ].join(', ');
  const prazo = Number(data.prazoCumprimento) || 30;
  const prorr = Number(data.prorrogacaoPrazo) || 0;
  const totalDias = prazo + prorr;

  const pendenciasList =
    Array.isArray(data.pendencias) && data.pendencias.length > 0
      ? data.pendencias
          .map((p, i) => `${i + 1}. ${typeof p === 'string' ? p : p.descricao}`)
          .join('\n')
      : 'Nenhuma pendência técnica registrada até o momento.';

  const analistasList = [
    ...(data.analistas || []),
    ...(data.analistasOutros || []).filter((x) => x && x.trim()),
  ];

  const introByTipo =
    tipo === '2° Oficio de Pendencias'
      ? `Em continuidade à análise do Processo Administrativo nº ${processoRef} (2ª reiteração de diligência técnica), referente à barragem do empreendimento ${empreendimento} (${municipio} — ${coords}), de responsabilidade de ${interessado}${cpfCnpj}, solicitamos o saneamento definitivo das pendências técnicas remanescentes listadas abaixo:`
      : tipo === 'Oficio Geral'
        ? `Cumprimentando-o(a) cordialmente, comunicamos que, no âmbito do Processo Administrativo nº ${processoRef}, referente ao empreendimento ${empreendimento} (${municipio} — ${coords}), de interesse de ${interessado}${cpfCnpj}, encaminhamos as seguintes determinações e esclarecimentos técnicos:`
        : `Cumprimentando-o(a) cordialmente, informamos que após análise técnica do Processo Administrativo nº ${processoRef}, referente à segurança da barragem do empreendimento ${empreendimento} (${municipio} — ${coords}), de responsabilidade de ${interessado}${cpfCnpj}, constatou-se a necessidade de saneamento e complementação das seguintes pendências técnicas:`;

  return [
    `OFÍCIO Nº ${numOficio}/CSB/SURH/SEMA-MT (${tipo})`,
    `Cuiabá-MT, ${formatPtBrDateExtenso(data.dataEmissao)}.`,
    '',
    `Interessado(a): ${interessado}${cpfCnpj}`,
    `Empreendimento: ${empreendimento} • Município: ${municipio}`,
    rts ? `Responsável(is) Técnico(s): ${rts}${data.art ? ` (ART: ${data.art})` : ''}` : null,
    `Assunto: ${data.assunto || 'Ofício de Pendências - Segurança de Barragens'}`,
    '',
    'Prezado(a) Senhor(a),',
    '',
    introByTipo,
    '',
    pendenciasList,
    '',
    prorr > 0
      ? `Prazo total para atendimento: ${totalDias} dias corridos (${prazo} dias iniciais + ${prorr} dias de prorrogação), sob pena das sanções previstas na Lei nº 12.334/2010 e Resolução CNRH nº 230/2022.`
      : `Prazo para atendimento: ${prazo} dias corridos contados do recebimento, sob pena das sanções administrativas cabíveis nos termos da Lei nº 12.334/2010 e Resolução CNRH nº 230/2022.`,
    '',
    'Atenciosamente,',
    analistasList.length > 0 ? analistasList.join('\n') : 'Coordenadoria de Segurança de Barragens — CSB/SURH/SEMA-MT',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function buildParecerRevisaoText(data: Partial<ParecerData>): string {
  const tipo = data.tipo_documento || 'Parecer Técnico';
  const numParecer = data.numParecerTecnico || data.processo || '___';
  const coords = formatGmsPair(data.coordenadasGMS);
  const pecasList = Array.isArray(data.pecasTecnicas) ? data.pecasTecnicas : [];
  const pecasDesc =
    pecasList.length > 0
      ? pecasList
          .map((p) => (p === 'Outros documentos' && data.pecasTecnicasOutro ? data.pecasTecnicasOutro : p))
          .join(', ')
      : 'documentação técnica';

  const rts = [
    ...(data.responsaveisTecnicos || []),
    ...(data.rtOutros || []).filter((n) => n && n.trim() !== ''),
    ...(data.responsavelTecnico ? [data.responsavelTecnico] : []),
  ]
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .join(', ');

  const analistas = [
    ...(data.analistas || []),
    ...(data.analistasOutros || []).filter((n) => n && n.trim() !== ''),
  ];

  const usoPrepond =
    data.usoPreponderante === 'Outro'
      ? data.usoPreponderanteOutro || 'Outro'
      : data.usoPreponderante || '___';

  const situacaoEmp =
    data.situacaoEmpreendimento === 'Outro'
      ? data.situacaoEmpreendimentoOutro || 'Outro'
      : data.situacaoEmpreendimento || '___';

  const nomeEmp = data.nomeBarragem || data.localizacaoEmpreendimento || '___';

  const sections: string[] = [
    'ESTADO DE MATO GROSSO',
    'SECRETARIA DE ESTADO DE MEIO AMBIENTE',
    `${tipo.toUpperCase()} Nº ${numParecer} – CSB/SURH/SEMA-MT`,
    '',
    `Processo nº ${data.processo || '___'}`,
    `Assunto: ${tipo} da análise de ${pecasDesc} do empreendimento ${nomeEmp} do empreendedor ${
      data.identificacaoEmpreendedor || '___'
    } no município de ${data.municipio || '___'}/MT sob as coordenadas ${coords}.`,
    '',
    '1. DADOS DO EMPREENDIMENTO',
    `Empreendedor: ${data.identificacaoEmpreendedor || '___'}`,
    `CPF/CNPJ: ${data.cpfCnpj || '___'}`,
    `Empreendimento / Barragem: ${nomeEmp}`,
    `Nº CAR/MT: ${data.numCarMt || '___'}`,
    `Município/UF: ${data.municipio || '___'}/MT`,
    `Finalidade do barramento: ${usoPrepond}`,
    `Situação do empreendimento: ${situacaoEmp}`,
    `Nome do curso d’água barrado: ${data.nomeCursoAguaBarrado || '___'}`,
    `Código SNISB: ${data.snisb || '___'}`,
    `Coordenadas: ${coords}`,
    `Portaria de Classificação: ${data.portariaClassificacao || '___'} | Parecer: ${data.parecerClassificacao || '___'}`,
    `Classificação: ${data.classificacaoBarragem || '___'} | DPA: ${data.classificacaoDPA || '___'} | CRI: ${data.classificacaoCRI || '___'}`,
    `Dimensões: Altura ${data.alturaBarragem || '___'} m | Largura Coroamento ${data.larguraCoroamento || '___'} m | Comprimento ${data.comprimentoCoroamento || '___'} m | Volume ${data.volumeBarragem || '___'} hm³`,
    `*Dados apresentados pelo responsável técnico ${rts || '___'} mediante ART CREA/MT nº ${data.artCreaMt || '___'}.`,
    '',
    'INTRODUÇÃO',
    `De acordo com a Política Nacional de Segurança de Barragens, Lei nº 12.334, de 20 de setembro de 2010, em seu artigo 5º inciso I, a fiscalização da segurança de barragens compete à entidade que outorga o direito de uso dos recursos hídricos, observado o domínio do corpo hídrico, quando o objeto for de acumulação de água, exceto para fins de aproveitamento hidrelétrico. A fiscalização baseia-se em análise documental, tratando-se especificamente de ${pecasDesc}, apresentado mediante protocolo nº ${
      data.numProtocoloAnalisado || '___'
    } de ${data.dataProtocolo || '___'}.`,
    'No Estado de Mato Grosso, os critérios técnicos e procedimentos administrativos aplicáveis estão estabelecidos na Resolução CNRH nº 241/2024, Resolução ANA nº 132/2016, Instrução Normativa SEMA nº 08/2023 e Resolução CEHIDRO nº 163/2023.',
  ];

  if (data.introducaoParticularidade?.trim()) {
    sections.push(data.introducaoParticularidade.trim());
  }

  sections.push(
    `Este ${tipo} analisa os documentos apresentados mediante protocolo nº ${
      data.numProtocoloAnalisado || '___'
    } de ${data.dataProtocolo || '___'} pelo responsável técnico ${rts || '___'}, mediado pela ART CREA/MT nº ${
      data.artCreaMt || '___'
    } para a atividade de ${data.artAtividade || 'Inspeção de Segurança de Barragem'}.`
  );

  pecasList.forEach((peca, idx) => {
    const label = peca === 'Outros documentos' && data.pecasTecnicasOutro ? data.pecasTecnicasOutro : peca;
    sections.push(
      '',
      `${idx + 2}. APRESENTAÇÃO DO RELATÓRIO DE ${label.toUpperCase()}`,
      `Os documentos analisados foram apresentados por ${rts || '___'} (ART nº ${data.artCreaMt || '___'} — ${
        data.artAtividade || '___'
      }), protocolizados em ${data.dataProtocolo || '___'} sob nº ${
        data.numProtocoloAnalisado || '___'
      }, juntados ao processo administrativo nº ${data.processo || '___'}. Inspeção registrada em ${
        data.dataInspecao || '___'
      }.`,
      `O barramento localizado nas coordenadas ${coords} possui altura de ${data.alturaBarragem || '___'} m, comprimento de ${
        data.comprimentoCoroamento || '___'
      } m e capacidade de reservatório de ${data.volumeBarragem || '___'} hm³. Conforme Parecer nº ${
        data.parecerClassificacao || '___'
      } e Portaria nº ${data.portariaClassificacao || '___'}, o DPA encontra-se classificado como ${
        data.classificacaoDPA || '___'
      }.`
    );

    if ((data.classificacaoDPA || '').toLowerCase().includes('não enquadrado') && data.dpaNaoPnsbTexto?.trim()) {
      sections.push(data.dpaNaoPnsbTexto.trim());
    }
    if (data.apresentacaoRelatorioConclusao?.trim()) {
      sections.push(data.apresentacaoRelatorioConclusao.trim());
    }
  });

  const parecerSectionNum = pecasList.length + 2;
  sections.push(
    '',
    `${parecerSectionNum}. PARECER E ANÁLISE TÉCNICA`,
    data.analiseTecnica?.trim() ||
      `Os documentos protocolados sob nº ${data.numProtocoloAnalisado || '___'} contemplaram os requisitos mínimos aplicáveis à segurança do barramento, recomendando-se a execução integral das manutenções e adequações indicadas pelo responsável técnico, permanecendo o empreendedor sujeito à fiscalização e responsável pela integridade estrutural e reparação de eventuais danos.`
  );

  if (data.conclusao?.trim()) {
    sections.push('', 'CONCLUSÃO', data.conclusao.trim());
  }

  if (Array.isArray(data.topicosExtras) && data.topicosExtras.length > 0) {
    data.topicosExtras.forEach((topico, tIdx) => {
      sections.push(
        '',
        `${parecerSectionNum + 1 + tIdx}. ${(topico.titulo || 'DISPOSIÇÕES ADICIONAIS').toUpperCase()}`,
        topico.conteudo || ''
      );
    });
  }

  const disposicoesNum = parecerSectionNum + 1 + (data.topicosExtras?.length || 0);
  sections.push(
    '',
    `${disposicoesNum}. DISPOSIÇÕES FINAIS`,
    'É responsabilidade do empreendedor comunicar ao órgão fiscalizador qualquer alteração na barragem, bem como realizar a gestão contínua da segurança e reparação de danos decorrentes de rompimento, vazamento ou mau funcionamento, garantindo acesso irrestrito à fiscalização e aos órgãos do SINPDEC. Este parecer não autoriza obras que dependam de licenciamento ambiental prévio.',
    '',
    `Cuiabá/MT, ${formatPtBrDateExtenso(data.dataParecer || data.data)}.`,
    analistas.length > 0 ? `\n${analistas.join('\n')}` : ''
  );

  return sections.filter((s) => s !== undefined).join('\n');
}

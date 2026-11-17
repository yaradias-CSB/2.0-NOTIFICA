import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ParecerData, OficioData, NotificacaoData } from '../types';
import { SEMA_MT, CSB_SURH, APP_LOGO_URL } from '../constants';
import {
  buildNotificacaoText,
  buildOficioCorpoText,
  buildParecerRevisaoText,
} from './documentTemplates';

// Helper to format date in Brazilian Portuguese
const formatExtensoDate = (dateStr?: string): string => {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) {
    const today = new Date();
    return `${today.getDate()} de ${today.toLocaleDateString('pt-BR', { month: 'long' })} de ${today.getFullYear()}`;
  }
  return `${d.getDate()} de ${d.toLocaleDateString('pt-BR', { month: 'long' })} de ${d.getFullYear()}`;
};

// Format GMS coordinates
const formatCoordinates = (coords: any): string => {
  if (!coords) return 'Não informada';
  if (typeof coords === 'string') return coords;
  if (coords.lat && coords.long) {
    const latStr = typeof coords.lat === 'object' 
      ? `${coords.lat.g || '00'}°${coords.lat.m || '00'}'${String(coords.lat.s || '00').replace('.', ',')}"S`
      : String(coords.lat);
    const longStr = typeof coords.long === 'object'
      ? `${coords.long.g || '00'}°${coords.long.m || '00'}'${String(coords.long.s || '00').replace('.', ',')}"W`
      : String(coords.long);
    return `Lat: ${latStr} | Long: ${longStr}`;
  }
  return 'Não informada';
};

// Try loading logo to base64, with silent fallback
const loadLogoBase64 = async (url: string): Promise<string | null> => {
  try {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    return await new Promise<string | null>((resolve) => {
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  } catch {
    return null;
  }
};

// Draw Institutional Header on the PDF
const drawInstitutionalHeader = (doc: jsPDF, logoBase64: string | null) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Decorative top bar (Mato Grosso green and gold)
  doc.setFillColor(4, 120, 87); // Emerald 700
  doc.rect(0, 0, pageWidth, 4, 'F');
  doc.setFillColor(217, 119, 6); // Amber 600
  doc.rect(0, 4, pageWidth, 1.5, 'F');

  let headerStartY = 14;
  let textStartX = 20;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 16, 10, 18, 18);
      textStartX = 38;
    } catch {
      textStartX = 20;
    }
  } else {
    // Elegant institutional crest badge
    doc.setFillColor(4, 120, 87);
    doc.roundedRect(16, 10, 16, 16, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('SEMA', 24, 18, { align: 'center' });
    doc.setFontSize(6);
    doc.text('MT', 24, 23, { align: 'center' });
    textStartX = 36;
  }

  // Institutional text hierarchy
  doc.setTextColor(15, 23, 42); // slate-900
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text('ESTADO DE MATO GROSSO', textStartX, headerStartY);

  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('SECRETARIA DE ESTADO DE MEIO AMBIENTE - SEMA', textStartX, headerStartY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text('SUPERINTENDÊNCIA DE RECURSOS HÍDRICOS - SURH', textStartX, headerStartY + 8.5);
  doc.text('COORDENADORIA DE SEGURANÇA DE BARRAGENS - CSB', textStartX, headerStartY + 12);

  // Bottom dividing line
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.6);
  doc.line(16, 32, pageWidth - 16, 32);
};

// Draw Institutional Footer with Page Numbers
const drawInstitutionalFooter = (doc: jsPDF) => {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Top border of footer
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.4);
    doc.line(16, pageHeight - 14, pageWidth - 16, pageHeight - 14);

    // Left info
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text('SEMA-MT • Coordenadoria de Segurança de Barragens • CSB/SURH', 16, pageHeight - 9);
    doc.text('Rua C, s/n, Centro Político Administrativo • CEP 78049-913 • Cuiabá/MT', 16, pageHeight - 5.5);

    // Right page number
    doc.setFont('helvetica', 'bold');
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 16, pageHeight - 9, { align: 'right' });
  }
};

/**
 * Exporta Parecer Técnico em PDF com layout institucional oficial SEMA-MT
 */
export const generateParecerPDF = async (data: ParecerData) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const logoBase64 = typeof window !== 'undefined' ? await loadLogoBase64(APP_LOGO_URL) : null;

  drawInstitutionalHeader(doc, logoBase64);

  let currentY = 40;

  // Title block
  const numParecer = data.numParecerTecnico || (data as any).numParecer || data.processo || '____';
  const tipoTitulo = (data.tipo_documento || 'PARECER TÉCNICO').toUpperCase();

  doc.setFillColor(248, 250, 252); // slate-50
  doc.roundedRect(16, currentY, pageWidth - 32, 16, 2, 2, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(16, currentY, pageWidth - 32, 16, 2, 2, 'S');

  doc.setTextColor(4, 120, 87); // emerald-700
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`${tipoTitulo} Nº ${numParecer}/CSB/SURH/SEMA-MT`, pageWidth / 2, currentY + 6.5, { align: 'center' });

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Processo Administrativo SEMA-MT: ${data.processo || 'S/N'} • Status: ${data.status || 'Rascunho'}`, pageWidth / 2, currentY + 12, { align: 'center' });

  currentY += 21;

  // Section: Dados do Empreendimento e do Processo (Table)
  const coordsFormatted = formatCoordinates(data.coordenadasGMS);
  const analistasStr = Array.isArray(data.analistas) && data.analistas.length > 0
    ? data.analistas.join(', ')
    : 'Não especificado';

  const dadosGerais = [
    [{ content: 'Processo:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, data.processo || '---',
     { content: 'Data Recebimento:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, data.dataRecebimentoProcesso || '---'],
    [{ content: 'Interessado / Empreendedor:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, data.identificacaoEmpreendedor || '---',
     { content: 'CPF / CNPJ:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, data.cpfCnpj || '---'],
    [{ content: 'Nome da Barragem / Local:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, data.nomeBarragem || data.localizacaoEmpreendimento || '---',
     { content: 'Município:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, `${data.municipio || '---'} / MT`],
    [{ content: 'Coordenadas Geográficas:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, coordsFormatted,
     { content: 'Cód. SNISB:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, data.snisb || '---'],
    [{ content: 'Responsável Técnico:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, data.responsavelTecnico || '---',
     { content: 'ART / CREA:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, `${data.artCreaMt || data.numArt || '---'}`],
    [{ content: 'Classificação DPA / CRI:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, `DPA: ${data.classificacaoDPA || '---'} | CRI: ${data.classificacaoCRI || '---'}`,
     { content: 'Situação:', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, data.situacaoEmpreendimento || '---'],
    [{ content: 'Analista(s) Responsável(is):', styles: { fontStyle: 'bold', textColor: [51, 65, 85] } }, { content: analistasStr, colSpan: 3 }]
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 16, right: 16 },
    head: [[{ content: '1. DADOS DE IDENTIFICAÇÃO DO PROCESSO E DO EMPREENDIMENTO', colSpan: 4, styles: { fillColor: [4, 120, 87], textColor: 255, fontStyle: 'bold', fontSize: 9 } }]],
    body: dadosGerais as any,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2, textColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 42, fillColor: [248, 250, 252] },
      1: { cellWidth: 47 },
      2: { cellWidth: 40, fillColor: [248, 250, 252] },
      3: { cellWidth: 47 }
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 7;

  // Function to print a section block with auto-pagination check
  const printSectionHeader = (title: string) => {
    if (currentY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      drawInstitutionalHeader(doc, logoBase64);
      currentY = 40;
    }
    doc.setFillColor(241, 245, 249);
    doc.rect(16, currentY, pageWidth - 32, 6.5, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(title, 19, currentY + 4.5);
    currentY += 9;
  };

  const printParagraphs = (text?: string, fallback: string = 'Não informado.') => {
    const content = text && text.trim() ? text.trim() : fallback;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    
    const lines = doc.splitTextToSize(content, pageWidth - 34);
    
    for (const line of lines) {
      if (currentY > doc.internal.pageSize.getHeight() - 25) {
        doc.addPage();
        drawInstitutionalHeader(doc, logoBase64);
        currentY = 40;
      }
      doc.text(line, 17, currentY);
      currentY += 4.2;
    }
    currentY += 4;
  };

  // Section 2: Introdução
  printSectionHeader('2. INTRODUÇÃO E HISTÓRICO');
  const introText = (data.revisaoParecer && data.revisaoParecer.trim()) ||
    data.introducaoParticularidade ||
    buildParecerRevisaoText(data);
  printParagraphs(introText);

  // Section 3: Peças Técnicas
  printSectionHeader('3. PEÇAS TÉCNICAS E DOCUMENTOS ANALISADOS');
  if (Array.isArray(data.pecasTecnicas) && data.pecasTecnicas.length > 0) {
    const pecasBody = data.pecasTecnicas.map((peca, idx) => [
      { content: String(idx + 1), styles: { halign: 'center' } },
      peca,
      'Apresentado nos autos'
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: 16, right: 16 },
      head: [['Item', 'Peça Técnica / Documento', 'Situação']],
      body: pecasBody as any,
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 120 }, 2: { cellWidth: 44 } }
    });
    currentY = (doc as any).lastAutoTable.finalY + 7;
  } else {
    printParagraphs('Nenhuma peça técnica específica selecionada.');
  }

  // Section 4: Análise Técnica
  printSectionHeader('4. ANÁLISE TÉCNICA E CRITÉRIOS DE SEGURANÇA');
  printParagraphs(data.analiseTecnica || 'A documentação apresentada foi avaliada conforme a legislação e normas vigentes de segurança de barragens da SEMA/MT.');

  // Section 5: Conclusão
  printSectionHeader('5. CONCLUSÃO E RECOMENDAÇÕES');
  printParagraphs(data.conclusao || 'Diante do exposto e com base na documentação analisada, emite-se o presente parecer técnico para os devidos fins legais e administrativos.');

  // Topicos Extras se houver
  if (Array.isArray(data.topicosExtras) && data.topicosExtras.length > 0) {
    data.topicosExtras.forEach((topico, idx) => {
      printSectionHeader(`5.${idx + 1}. ${topico.titulo || 'DISPOSIÇÃO ADICIONAL'}`);
      printParagraphs(topico.conteudo);
    });
  }

  // Disposições Finais
  printSectionHeader('6. DISPOSIÇÕES FINAIS E ADVERTÊNCIAS');
  const disposicoes = 
    'É responsabilidade do empreendedor comunicar ao órgão fiscalizador sobre qualquer alteração na sua barragem, bem como realizar a gestão contínua de segurança e reparação de danos decorrentes de vazamento ou mau funcionamento. ' +
    'O empreendedor deverá permitir o acesso irrestrito da equipe de fiscalização e dos órgãos da Defesa Civil. ' +
    'Salienta-se que este parecer não autoriza intervenções ou obras civis que exijam licenciamento ambiental específico prévio.';
  printParagraphs(disposicoes);

  // Local, data e assinaturas
  if (currentY > doc.internal.pageSize.getHeight() - 45) {
    doc.addPage();
    drawInstitutionalHeader(doc, logoBase64);
    currentY = 40;
  }

  currentY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  doc.text(`Cuiabá-MT, ${formatExtensoDate(data.dataParecer || data.data || data.created_at)}.`, pageWidth - 16, currentY, { align: 'right' });

  currentY += 16;

  // Analistas assinaturas
  const analistasList = (Array.isArray(data.analistas) && data.analistas.length > 0)
    ? data.analistas
    : ['Analista de Meio Ambiente'];

  analistasList.forEach((analista) => {
    if (currentY > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      drawInstitutionalHeader(doc, logoBase64);
      currentY = 40;
    }
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(pageWidth / 2 - 40, currentY, pageWidth / 2 + 40, currentY);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(analista, pageWidth / 2, currentY + 4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Analista de Meio Ambiente / Fiscalizador', pageWidth / 2, currentY + 8, { align: 'center' });
    doc.text(CSB_SURH, pageWidth / 2, currentY + 11.5, { align: 'center' });

    currentY += 20;
  });

  drawInstitutionalFooter(doc);

  const safeFilename = `Parecer_${(data.processo || numParecer || 'Novo').replace(/[\/\\]/g, '-')}.pdf`;
  doc.save(safeFilename);
};

/**
 * Exporta Ofício de Pendências em PDF com layout institucional oficial SEMA-MT
 */
export const generateOficioPDF = async (data: OficioData & { totalDias?: number; dataFinal?: string }) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const logoBase64 = typeof window !== 'undefined' ? await loadLogoBase64(APP_LOGO_URL) : null;

  drawInstitutionalHeader(doc, logoBase64);

  let currentY = 42;

  // Local e data à direita
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 41, 59);
  doc.text(`Cuiabá-MT, ${formatExtensoDate(data.dataEmissao || data.created_at)}.`, pageWidth - 16, currentY, { align: 'right' });

  currentY += 10;

  // Número do Ofício
  const numOficio = (data as any).numeroOficio || data.protocolo || (data as any).oficioNumero || '____';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(4, 120, 87); // Emerald 700
  doc.text(`Ofício nº ${numOficio}/CSB/SURH/SEMA-MT`, 16, currentY);

  currentY += 8;

  // Bloco Destinatário
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Ao Senhor(a):', 16, currentY);

  doc.setFont('helvetica', 'normal');
  currentY += 5;
  doc.text(data.interessado || 'Interessado não informado', 16, currentY);

  if (data.logradouro || data.cidadeUf || data.cep) {
    currentY += 4.5;
    const endereco = [
      data.logradouro,
      data.numero ? `nº ${data.numero}` : null,
      data.complemento,
      data.bairro
    ].filter(Boolean).join(', ');
    if (endereco) doc.text(endereco, 16, currentY);

    if (data.cidadeUf || data.cep) {
      currentY += 4.5;
      const cidadeCep = [
        data.cidadeUf ? `${data.cidadeUf} - MT` : null,
        data.cep ? `CEP: ${data.cep}` : null
      ].filter(Boolean).join(' • ');
      doc.text(cidadeCep, 16, currentY);
    }
  }

  currentY += 8;

  // Assunto e Referência
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(16, currentY, pageWidth - 32, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text('Assunto:', 19, currentY + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(data.assunto || 'Ofício de Pendências - Segurança de Barragens', 35, currentY + 5.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(51, 65, 85);
  doc.text('Processo:', 19, currentY + 11.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(data.processo || data.protocolo || (data as any).numeroProcesso || '---', 35, currentY + 11.5);

  if (data.empreendimento) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text('Empreendimento:', 95, currentY + 11.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(data.empreendimento, 124, currentY + 11.5);
  }

  currentY += 22;

  // Vocativo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Prezado(a) Senhor(a),', 16, currentY);

  currentY += 6;

  // Texto de introdução do ofício
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const textoIntro = data.tipo_documento === '2° Oficio de Pendencias'
    ? 'Em continuidade à análise do processo administrativo em referência (2ª reiteração de diligência), solicitamos o saneamento definitivo das seguintes pendências técnicas:'
    : data.tipo_documento === 'Oficio Geral'
      ? 'Cumprimentando-o(a) cordialmente, encaminhamos os esclarecimentos e determinações técnicas relativas ao empreendimento supracitado:'
      : buildOficioCorpoText(data).split('\n').find((l) => l.startsWith('Cumprimentando-o(a)')) ||
        'Cumprimentando-o(a) cordialmente, informamos que após análise técnica do processo administrativo em referência, relativo à segurança da barragem do empreendimento supracitado, constatou-se a necessidade de saneamento e complementação das seguintes pendências técnicas:';
  const introLines = doc.splitTextToSize(textoIntro, pageWidth - 32);
  doc.text(introLines, 16, currentY);

  currentY += (introLines.length * 4.5) + 4;

  // Tabela de Pendências
  const pendencias = Array.isArray(data.pendencias) ? data.pendencias : [];
  if (pendencias.length > 0) {
    const pendenciasBody = pendencias.map((p: any, idx: number) => [
      { content: String(idx + 1).padStart(2, '0'), styles: { halign: 'center', fontStyle: 'bold' } },
      typeof p === 'string' ? p : (p.descricao || 'Item de pendência sem descrição')
    ]);

    autoTable(doc, {
      startY: currentY,
      margin: { left: 16, right: 16 },
      head: [['Item', 'Descrição Detalhada da Pendência Técnica']],
      body: pendenciasBody as any,
      theme: 'grid',
      headStyles: { fillColor: [4, 120, 87], textColor: 255, fontSize: 8.5, fontStyle: 'bold' },
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [30, 41, 59] },
      columnStyles: {
        0: { cellWidth: 14, fillColor: [248, 250, 252] },
        1: { cellWidth: 164 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhuma pendência técnica listada.', 16, currentY);
    currentY += 8;
  }

  // Caixa de Prazo
  if (currentY > doc.internal.pageSize.getHeight() - 55) {
    doc.addPage();
    drawInstitutionalHeader(doc, logoBase64);
    currentY = 40;
  }

  const prazo = data.prazoCumprimento || 30;
  const prorr = data.prorrogacaoPrazo || 0;
  const total = data.totalDias || (prazo + prorr);

  doc.setFillColor(254, 243, 199); // amber-100
  doc.setDrawColor(245, 158, 11); // amber-500
  doc.roundedRect(16, currentY, pageWidth - 32, 14, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(146, 64, 14); // amber-900
  doc.text(`PRAZO PARA ATENDIMENTO: ${prazo} DIAS CORRIDOS`, 20, currentY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const infoPrazo = prorr > 0 
    ? `Prorrogação concedida de ${prorr} dias (Prazo Total: ${total} dias). ${data.dataFinal ? `Data limite prevista: ${data.dataFinal}.` : ''}`
    : `O não atendimento no prazo regulamentar ensejará as medidas administrativas cabíveis.`;
  doc.text(infoPrazo, 20, currentY + 10);

  currentY += 20;

  // Fecho
  if (currentY > doc.internal.pageSize.getHeight() - 40) {
    doc.addPage();
    drawInstitutionalHeader(doc, logoBase64);
    currentY = 40;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Atenciosamente,', 16, currentY);

  currentY += 18;

  // Assinatura
  const analistasList = (Array.isArray(data.analistas) && data.analistas.length > 0)
    ? data.analistas
    : ['Analista de Meio Ambiente'];

  analistasList.forEach((analista) => {
    if (currentY > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      drawInstitutionalHeader(doc, logoBase64);
      currentY = 40;
    }
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(pageWidth / 2 - 40, currentY, pageWidth / 2 + 40, currentY);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(analista, pageWidth / 2, currentY + 4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Analista de Meio Ambiente / Fiscalizador', pageWidth / 2, currentY + 8, { align: 'center' });
    doc.text(CSB_SURH, pageWidth / 2, currentY + 11.5, { align: 'center' });

    currentY += 20;
  });

  drawInstitutionalFooter(doc);

  const safeFilename = `Oficio_${(numOficio || 'Novo').replace(/[\/\\]/g, '-')}.pdf`;
  doc.save(safeFilename);
};

/**
 * Exporta Notificação em PDF com layout institucional oficial SEMA-MT
 */
export const generateNotificacaoPDF = async (data: NotificacaoData) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const logoBase64 = typeof window !== 'undefined' ? await loadLogoBase64(APP_LOGO_URL) : null;

  drawInstitutionalHeader(doc, logoBase64);

  let currentY = 42;

  // Número da Notificação
  const numNotif = data.notificacaoGerada || (data as any).numNotificacao || '____';
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(16, currentY, pageWidth - 32, 14, 2, 2, 'F');
  doc.setDrawColor(124, 58, 237); // Violet
  doc.roundedRect(16, currentY, pageWidth - 32, 14, 2, 2, 'S');

  doc.setTextColor(109, 40, 217);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(`NOTIFICAÇÃO Nº ${numNotif}/CSB/SURH/SEMA-MT`, pageWidth / 2, currentY + 6, { align: 'center' });

  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Processo: ${data.numProcesso || '---'} • Data: ${data.dataNotificacao || formatExtensoDate()}`, pageWidth / 2, currentY + 10.5, { align: 'center' });

  currentY += 20;

  // Tabela com dados do notificado
  const dadosNotif = [
    [{ content: 'Notificado / Empreendedor:', styles: { fontStyle: 'bold' } }, data.empreendedorNome || '---',
     { content: 'CPF / CNPJ:', styles: { fontStyle: 'bold' } }, data.documentoIdentificacao || '---'],
    [{ content: 'Empreendimento:', styles: { fontStyle: 'bold' } }, data.nomeFantasia || data.enderecoEmpreendimento || '---',
     { content: 'Município:', styles: { fontStyle: 'bold' } }, `${data.municipioEmpreendimento || '---'} / MT`],
    [{ content: 'Prazo Vencimento:', styles: { fontStyle: 'bold' } }, data.prazoVencimento || 'Conforme notificação',
     { content: 'Situação:', styles: { fontStyle: 'bold' } }, data.situacao || 'Em aberto']
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 16, right: 16 },
    head: [[{ content: 'DADOS DO NOTIFICADO E LOCALIZAÇÃO', colSpan: 4, styles: { fillColor: [109, 40, 217], textColor: 255, fontStyle: 'bold', fontSize: 8.5 } }]],
    body: dadosNotif as any,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5 }
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // Texto da Notificação
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('TEOR DA NOTIFICAÇÃO:', 16, currentY);
  currentY += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const textoNotifFinal = (data.textoNotificacao && data.textoNotificacao.trim()) || buildNotificacaoText(data);
  const textoLines = doc.splitTextToSize(textoNotifFinal, pageWidth - 32);
  
  for (const line of textoLines) {
    if (currentY > doc.internal.pageSize.getHeight() - 30) {
      doc.addPage();
      drawInstitutionalHeader(doc, logoBase64);
      currentY = 40;
    }
    doc.text(line, 16, currentY);
    currentY += 4.5;
  }

  currentY += 15;

  // Assinatura
  if (currentY > doc.internal.pageSize.getHeight() - 35) {
    doc.addPage();
    drawInstitutionalHeader(doc, logoBase64);
    currentY = 40;
  }

  const analistasList = (Array.isArray(data.analistas) && data.analistas.length > 0)
    ? data.analistas
    : ['Analista de Meio Ambiente / Fiscalizador'];

  analistasList.forEach((analista) => {
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(pageWidth / 2 - 40, currentY, pageWidth / 2 + 40, currentY);
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(analista, pageWidth / 2, currentY + 4, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('Fiscalizador / Analista SEMA-MT', pageWidth / 2, currentY + 8, { align: 'center' });
    doc.text(CSB_SURH, pageWidth / 2, currentY + 11.5, { align: 'center' });
    currentY += 20;
  });

  drawInstitutionalFooter(doc);

  const safeFilename = `Notificacao_${(numNotif || 'Nova').replace(/[\/\\]/g, '-')}.pdf`;
  doc.save(safeFilename);
};

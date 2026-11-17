import { 
  Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, 
  Table, TableRow, TableCell, WidthType, ImageRun, BorderStyle 
} from 'docx';
import { saveAs } from 'file-saver';
import { ParecerData, OficioData, NotificacaoData } from '../types';
import { SEMA_MT, CSB_SURH } from '../constants';
import { CABECALHO_SEMA_BASE64 } from '../assets/novoCabecalhoBase64';
import {
  buildNotificacaoText,
  buildOficioCorpoText,
  buildParecerRevisaoText,
} from './documentTemplates';

const createHeader = () => {
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "ESTADO DE MATO GROSSO", bold: true, size: 24 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "SECRETARIA DE ESTADO DE MEIO AMBIENTE", bold: true, size: 22 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: SEMA_MT, bold: true, size: 20 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: CSB_SURH, bold: true, size: 18 }),
      ],
    }),
    new Paragraph({ text: "", spacing: { after: 400 } }),
  ];
};

const base64ToUint8Array = (base64String: string): Uint8Array => {
  const cleanBase64 = base64String.includes(',') ? base64String.split(',')[1] : base64String;
  const binaryString = atob(cleanBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const generateOficioDoc = async (data: OficioData) => {
  const corpoTexto = buildOficioCorpoText(data);
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        ...createHeader(),
        ...corpoTexto.split('\n').map((line) =>
          new Paragraph({
            alignment: line.startsWith('OFÍCIO') ? AlignmentType.CENTER : AlignmentType.BOTH,
            children: [
              new TextRun({
                text: line,
                bold: line.startsWith('OFÍCIO') || line.startsWith('Assunto:') || line.startsWith('Interessado'),
                size: line.startsWith('OFÍCIO') ? 24 : 22,
              }),
            ],
            spacing: { after: line === '' ? 140 : 80 },
          })
        ),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Oficio_${(data.protocolo || 'Novo').replace(/[\/\\]/g, '-')}.docx`);
};

export const generateParecerDoc = async (data: ParecerData) => {
  const numParecer = data.numParecerTecnico || data.processo || '____';
  const tipoTitulo = (data.tipo_documento || 'PARECER TÉCNICO').toUpperCase();
  const revisaoTexto = (data.revisaoParecer && data.revisaoParecer.trim()) || buildParecerRevisaoText(data);
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        ...createHeader(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `${tipoTitulo} Nº ${numParecer}/CSB/SURH/SEMA-MT`, bold: true, size: 26 }),
          ],
        }),
        new Paragraph({ text: "", spacing: { after: 600 } }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "1. INTRODUÇÃO E CORPO DO PARECER", bold: true, size: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.BOTH,
          children: revisaoTexto.split('\n').map((line, i) => new TextRun({
            text: line,
            break: i > 0 ? 1 : undefined,
            size: 22
          })),
          spacing: { before: 200, after: 400 }
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "2. DADOS DO EMPREENDIMENTO", bold: true, size: 24 })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Interessado", bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: data.identificacaoEmpreendedor || '___' })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Empreendimento", bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: data.localizacaoEmpreendimento || '___' })] }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Município", bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ text: data.municipio || '___' })] }),
              ],
            }),
          ],
        }),
        new Paragraph({ text: "", spacing: { after: 600 } }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "3. CONCLUSÃO", bold: true, size: 24 })],
        }),
        new Paragraph({
          alignment: AlignmentType.BOTH,
          children: (data.conclusao || "Sem conclusão.").split('\n').map((line, i) => new TextRun({
            text: line,
            break: i > 0 ? 1 : undefined,
            size: 22
          })),
          spacing: { before: 200, after: 400 }
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Parecer_${data.processo?.replace(/\//g, '-') || 'Novo'}.docx`);
};

export const generateNotificacaoDoc = async (data: NotificacaoData) => {
  const textoNotifFinal = (data.textoNotificacao && data.textoNotificacao.trim()) || buildNotificacaoText(data);
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        ...createHeader(),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: `NOTIFICAÇÃO Nº ${data.notificacaoGerada || '____'}/CSB/SURH/SEMA-MT`, bold: true, size: 26 }),
          ],
        }),
        new Paragraph({ text: "", spacing: { after: 600 } }),
        new Paragraph({
          alignment: AlignmentType.BOTH,
          children: textoNotifFinal.split('\n').map((line, i) => new TextRun({
            text: line,
            break: i > 0 ? 1 : undefined,
            size: 22
          })),
          spacing: { before: 200, after: 400 }
        }),
        new Paragraph({ text: "", spacing: { after: 1200 } }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ 
              text: (data.analistas && data.analistas.length > 0) 
                ? data.analistas.join(', ') 
                : "__________________________________________", 
              size: 22 
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "Analista de Meio Ambiente / Fiscalizador", bold: true, size: 22 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: SEMA_MT, size: 20 }),
          ],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Notificacao_${data.notificacaoGerada || 'Nova'}.docx`);
};

export interface DamImageItem {
  damIndex: number;
  nome: string;
  lat: string;
  long: string;
  dataUrl: string;
  scaleMeters?: number;
  timestamp?: string;
}

/**
 * Gera o documento oficial DOCX do Tópico 6 — Relatório Técnico
 * incorporando as imagens de satélite reais geradas para a sessão
 */
export const generateRelatorioTecnicoDoc = async (
  data: NotificacaoData,
  damImages: DamImageItem[]
) => {
  const dateObj = data.dataNotificacao ? new Date(data.dataNotificacao + 'T12:00:00') : new Date();
  const dataExtenso = !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  const numProcesso = data.numProcesso || '____';
  const numNotificacao = data.notificacaoGerada || '____';
  const notificado = data.empreendedorNome || 'Não informado';
  const docIdentificacao = `${data.tipoDocumentoIdentificacao || 'CPF'}: ${data.documentoIdentificacao || '---'}`;
  const carMt = data.carMt || 'Não informado';
  const empreendimento = data.nomeFantasia || data.enderecoEmpreendimento || 'Propriedade Rural';
  const municipio = `${data.municipioEmpreendimento || '---'} - MT`;
  const enderecoCorrespondencia = [
    data.logradouro,
    data.numero ? `nº ${data.numero}` : '',
    data.bairro,
    data.municipioCorrespondencia ? `${data.municipioCorrespondencia}/${data.ufCorrespondencia || 'MT'}` : '',
    data.cepCorrespondencia ? `CEP: ${data.cepCorrespondencia}` : ''
  ].filter(Boolean).join(', ') || 'Não informado';

  const analistasList = (data.analistas && data.analistas.length > 0)
    ? data.analistas
    : ['Analista de Meio Ambiente / Fiscalizador'];

  // Constrói os elementos de imagem e legenda da Seção 3.1
  const imagensSecaoChildren: (Paragraph | Table)[] = [];

  if (damImages && damImages.length > 0) {
    damImages.forEach((imgItem, idx) => {
      if (imgItem.dataUrl && imgItem.dataUrl.startsWith('data:image/')) {
        try {
          const imageBytes = base64ToUint8Array(imgItem.dataUrl);

          imagensSecaoChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: imageBytes,
                  transformation: {
                    width: 540,
                    height: 330,
                  },
                  type: 'png',
                }),
              ],
              spacing: { before: 200, after: 100 },
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  text: `Figura ${idx + 1} — Imagem de satélite da ${imgItem.nome || 'Barragem ' + (idx + 1)} (Coordenadas: LAT ${imgItem.lat || "00°00'00,00\""} S | LONG ${imgItem.long || "00°00'00,00\""} O — ${municipio}).`,
                  size: 18,
                  italics: true,
                  color: "475569"
                }),
              ],
              spacing: { before: 50, after: 350 },
            })
          );
        } catch (e) {
          console.error('Erro ao adicionar imagem no DOCX:', e);
        }
      } else {
        imagensSecaoChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: `[Imagem de satélite da Barragem #${idx + 1} indisponível na geração atual]`,
                italics: true,
                size: 20,
                color: "94a3b8"
              }),
            ],
            spacing: { before: 100, after: 200 }
          })
        );
      }
    });
  } else {
    imagensSecaoChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Nenhuma coordenada de barramento registrada para exibição de imagem de satélite.",
            italics: true,
            size: 22,
          }),
        ],
        spacing: { before: 100, after: 200 }
      })
    );
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
      },
      children: [
        // Cabeçalho Institucional Oficial SEMA/MT
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: base64ToUint8Array(CABECALHO_SEMA_BASE64),
              transformation: {
                width: 560,
                height: 82,
              },
              type: 'png',
            }),
          ],
          spacing: { after: 300 },
        }),
        
        // Título Principal
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ 
              text: `RELATÓRIO TÉCNICO DE FISCALIZAÇÃO REMOTA`, 
              bold: true, 
              size: 26, 
              color: "047857" 
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ 
              text: `REFERÊNCIA: PROCESSO SEMA-MT Nº ${numProcesso} | NOTIFICAÇÃO Nº ${numNotificacao}/CSB/SURH`, 
              bold: true, 
              size: 20, 
              color: "334155" 
            }),
          ],
          spacing: { after: 400 },
        }),

        // 1. DADOS GERAIS
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "1. DADOS DE IDENTIFICAÇÃO DO PROCESSO E DO IMÓVEL", bold: true, size: 22 })],
          spacing: { before: 200, after: 150 },
        }),

        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({ 
                  width: { size: 30, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ children: [new TextRun({ text: "Processo Administrativo:", bold: true, size: 20 })] })] 
                }),
                new TableCell({ 
                  width: { size: 70, type: WidthType.PERCENTAGE },
                  children: [new Paragraph({ children: [new TextRun({ text: numProcesso, size: 20 })] })] 
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: "Notificado / Interessado:", bold: true, size: 20 })] })] 
                }),
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: notificado, size: 20 })] })] 
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: "CPF / CNPJ:", bold: true, size: 20 })] })] 
                }),
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: docIdentificacao, size: 20 })] })] 
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: "Cadastro Ambiental Rural (CAR):", bold: true, size: 20 })] })] 
                }),
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: carMt, size: 20 })] })] 
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: "Empreendimento / Fazenda:", bold: true, size: 20 })] })] 
                }),
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: empreendimento, size: 20 })] })] 
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: "Município de Localização:", bold: true, size: 20 })] })] 
                }),
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: municipio, size: 20 })] })] 
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: "Endereço de Notificação:", bold: true, size: 20 })] })] 
                }),
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: enderecoCorrespondencia, size: 20 })] })] 
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: "Equipe Técnica / Fiscalização:", bold: true, size: 20 })] })] 
                }),
                new TableCell({ 
                  children: [new Paragraph({ children: [new TextRun({ text: analistasList.join(', '), size: 20 })] })] 
                }),
              ],
            }),
          ],
        }),

        new Paragraph({ text: "", spacing: { after: 300 } }),

        // 2. OBJETIVO
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "2. OBJETIVO DA AÇÃO FISCALIZATÓRIA REMOTA", bold: true, size: 22 })],
          spacing: { before: 200, after: 150 },
        }),
        new Paragraph({
          alignment: AlignmentType.BOTH,
          children: [
            new TextRun({
              text: data.objetivo || "Notificação para o cadastro e a classificação do Dano Potencial Associado e Categoria de Risco, para barragens.",
              size: 22,
            }),
          ],
          spacing: { after: 300 },
        }),

        // 3. ANÁLISE GEORREFERENCIADA
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "3. ANÁLISE GEORREFERENCIADA E VISTORIA REMOTA", bold: true, size: 22 })],
          spacing: { before: 200, after: 150 },
        }),
        new Paragraph({
          alignment: AlignmentType.BOTH,
          children: [
            new TextRun({
              text: "A partir da verificação técnica geoespacial realizada por meio de imagens orbitais de satélite de alta resolução e confronto com a base cartográfica oficial da SEMA/MT e do Cadastro Ambiental Rural (CAR/MT), foram identificadas estruturas de retenção hídrica/barramentos artificiais no perímetro do imóvel indicado.",
              size: 22,
            }),
          ],
          spacing: { after: 200 },
        }),

        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: "3.1. Imagens de Satélite das Barragens Identificadas", bold: true, size: 21, color: "047857" })],
          spacing: { before: 150, after: 150 },
        }),

        ...imagensSecaoChildren,

        // 4. ENQUADRAMENTO TÉCNICO E LEGAL
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "4. ENQUADRAMENTO TÉCNICO E FUNDAMENTAÇÃO LEGAL", bold: true, size: 22 })],
          spacing: { before: 300, after: 150 },
        }),
        new Paragraph({
          alignment: AlignmentType.BOTH,
          children: [
            new TextRun({
              text: "A fiscalização de segurança de barragens de acumulação de água para usos múltiplos no Estado de Mato Grosso é regida pela Lei Federal nº 12.334/2010, Resolução CEHIDRO nº 163, de 18 de maio de 2023, e pela Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023.\n\nConsiderando as características dos espelhos d’água identificados na imagem do Cadastro Ambiental Rural " + (carMt || '<<CAR/MT>>') + ", bem como as condições e características técnicas estabelecidas no art. 24 da Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023, para fins de verificação da necessidade de classificação e cadastro, será obrigatória a classificação de segurança de toda barragem em operação que apresente, no mínimo, as seguintes características:\n" +
              "1 – Dano Potencial Associado (DPA) baixo;\n" +
              "2 – Altura do maciço, medida do ponto mais baixo do talude de jusante até o ponto mais alto da crista, maior ou igual a 3 m (três metros);\n" +
              "3 – Capacidade total do reservatório maior ou igual a 500.000 m³ (quinhentos mil metros cúbicos);\n" +
              "4 – Área de drenagem até o ponto do barramento maior ou igual a 2,0 km² (dois quilômetros quadrados).\n\n" +
              "Ressalta-se que, em observância ao disposto no art. 24 da Instrução Normativa SEMA nº 08, de 18 de dezembro de 2023, quanto aos critérios para a obrigatoriedade de classificação de segurança de barragens, caso as barragens existentes na referida propriedade não se enquadrem nos critérios previstos no referido artigo, deverão ser apresentadas informações suficientes para sua caracterização e para a comprovação da não obrigatoriedade de classificação.",
              size: 22,
            }),
          ],
          spacing: { after: 300 },
        }),

        // 5. CONCLUSÃO E ENCAMINHAMENTO
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: "5. CONCLUSÃO E ENCAMINHAMENTO", bold: true, size: 22 })],
          spacing: { before: 200, after: 150 },
        }),
        new Paragraph({
          alignment: AlignmentType.BOTH,
          children: [
            new TextRun({
              text: `Diante da identificação dos barramentos supramencionados e em conformidade com as diretrizes da Política Nacional de Segurança de Barragens (PNSB), conclui-se pela emissão da Notificação Administrativa ao responsável pela área vinculada ao CAR/MT nº ${carMt}, concedendo-se o prazo legal de ${data.prazoVencimento || '90'} dias corridos para o cumprimento das obrigações estabelecidas no respectivo instrumento noticiatório.`,
              size: 22,
            }),
          ],
          spacing: { after: 500 },
        }),

        // Data e Assinaturas
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: `Cuiabá/MT, ${dataExtenso}.`, size: 22 }),
          ],
          spacing: { after: 800 },
        }),

        ...analistasList.map(analista => [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "____________________________________________________", size: 20 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: analista, bold: true, size: 22 }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Analista de Meio Ambiente / Fiscalizador", size: 20, color: "475569" }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `${CSB_SURH} — SEMA/MT`, size: 18, color: "64748b" }),
            ],
            spacing: { after: 600 },
          }),
        ]).flat(),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  const cleanProcesso = (numProcesso || numNotificacao || 'Novo').replace(/[\/\\]/g, '-');
  saveAs(blob, `Relatorio_Tecnico_${cleanProcesso}.docx`);
};

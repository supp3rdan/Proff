// Documento .docx do planejamento do bimestre, no formato de tabela usado pelas escolas:
// ficha de identificação (área, série, ementa, competências, avaliação) e a tabela do bimestre
// com HABILIDADES (BNCC) | OBJETIVOS DE APRENDIZAGEM | CONTEÚDOS, mais a sequência de aulas.
// Função pura: recebe a biblioteca `docx` (no navegador, window.docx da CDN; nos testes, o pacote npm).

export const COMPETENCIAS_GERAIS = {
  1: 'Conhecimento',
  2: 'Pensamento científico, crítico e criativo',
  3: 'Repertório cultural',
  4: 'Comunicação',
  5: 'Cultura digital',
  6: 'Trabalho e projeto de vida',
  7: 'Argumentação',
  8: 'Autoconhecimento e autocuidado',
  9: 'Empatia e cooperação',
  10: 'Responsabilidade e cidadania',
};

// resumo das 5 competências específicas de Matemática do Ensino Médio
export const COMPETENCIAS_ESPECIFICAS = {
  1: 'Utilizar estratégias, conceitos e procedimentos matemáticos para interpretar situações em diversos contextos.',
  2: 'Propor ou participar de ações para investigar desafios do mundo contemporâneo e tomar decisões éticas e socialmente responsáveis.',
  3: 'Utilizar estratégias, conceitos e procedimentos matemáticos para interpretar, construir modelos e resolver problemas.',
  4: 'Compreender e utilizar, com flexibilidade e precisão, diferentes registros de representação matemáticos.',
  5: 'Investigar e estabelecer conjecturas a respeito de diferentes conceitos e propriedades matemáticas.',
};

const ordinal = (n) => `${n}º`;
// LaTeX não existe no Word: tira os $ e troca os comandos mais comuns por texto
export function textoSemLatex(t) {
  return String(t || '')
    .replace(/\$\$?([^$]+)\$\$?/g, '$1')
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
    .replace(/\\cdot|\\times/g, '·')
    .replace(/\\leq?|\\le\b/g, '≤')
    .replace(/\\geq?|\\ge\b/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\pi/g, 'π')
    .replace(/\{,\}/g, ',')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Tira do ZIP as entradas de pasta ("word/", "_rels/"...): o Word já recusou arquivos com elas
 * ao abrir pelo OneDrive/SharePoint. Copia os registros dos arquivos e refaz o diretório central.
 */
export function removerPastasDoZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = bytes.length - 22;
  while (fim >= 0 && v.getUint32(fim, true) !== 0x06054b50) fim--;
  if (fim < 0) return bytes;
  const total = v.getUint16(fim + 10, true);
  let pos = v.getUint32(fim + 16, true);
  const partes = [];
  const centrais = [];
  let deslocamento = 0;
  for (let i = 0; i < total; i++) {
    if (v.getUint32(pos, true) !== 0x02014b50) return bytes;
    const tamNome = v.getUint16(pos + 28, true);
    const tamExtra = v.getUint16(pos + 30, true);
    const tamComent = v.getUint16(pos + 32, true);
    const tamComprimido = v.getUint32(pos + 20, true);
    const inicioLocal = v.getUint32(pos + 42, true);
    const nome = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + tamNome));
    const tamCentral = 46 + tamNome + tamExtra + tamComent;
    if (!nome.endsWith('/')) {
      const flags = v.getUint16(inicioLocal + 6, true);
      const tamLocal = 30 + v.getUint16(inicioLocal + 26, true) + v.getUint16(inicioLocal + 28, true) + tamComprimido + (flags & 8 ? 16 : 0);
      partes.push(bytes.subarray(inicioLocal, inicioLocal + tamLocal));
      const central = bytes.slice(pos, pos + tamCentral);
      new DataView(central.buffer).setUint32(42, deslocamento, true);
      centrais.push(central);
      deslocamento += tamLocal;
    }
    pos += tamCentral;
  }
  const tamDiretorio = centrais.reduce((t, c) => t + c.length, 0);
  const eocd = bytes.slice(fim, fim + 22);
  const ve = new DataView(eocd.buffer);
  ve.setUint16(8, centrais.length, true);
  ve.setUint16(10, centrais.length, true);
  ve.setUint32(12, tamDiretorio, true);
  ve.setUint32(16, deslocamento, true);
  ve.setUint16(20, 0, true);
  const saida = new Uint8Array(deslocamento + tamDiretorio + 22);
  let k = 0;
  for (const b of [...partes, ...centrais, eocd]) { saida.set(b, k); k += b.length; }
  return saida;
}

export function nomeArquivoPlanejamento(s) {
  const base = `Planejamento ${s.bimestre ? `${s.bimestre}º bimestre ` : ''}${s.serie}º ano - ${s.titulo || 'Matemática'}`;
  return `${base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .º-]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 90)}.docx`;
}

/** Monta o Document do pacote docx. `sequencia` é a linha da tabela sequencias (com detalhes.planejamento). */
export function montarDocumentoPlanejamento(docx, sequencia) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType,
    BorderStyle, LevelFormat, VerticalAlign, PageBreak,
  } = docx;

  const p = sequencia.detalhes?.planejamento || {};
  const cab = sequencia.detalhes?.cabecalho || {};
  const serie = `${ordinal(sequencia.serie)} ano do Ensino Médio`;
  const bimestre = sequencia.bimestre ? `${ordinal(sequencia.bimestre)} BIMESTRE` : 'BIMESTRE';
  const itens = sequencia.itens || [];

  const FONTE = 'Arial Narrow';
  const CINZA = 'D9D9D9';
  const CINZA_ESCURO = 'BFBFBF';
  const LARANJA = 'FFC000';
  const LARGURA = 10206; // A4 (11906) menos margens de 850 (1,5 cm)
  const borda = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const bordas = { top: borda, bottom: borda, left: borda, right: borda };
  const margens = { top: 70, bottom: 70, left: 100, right: 100 };

  const run = (texto, opcoes = {}) => new TextRun({ text: textoSemLatex(texto), font: FONTE, size: 20, ...opcoes }); // espaços nas pontas são mantidos
  const par = (filhos, opcoes = {}) => new Paragraph({ spacing: { before: 0, after: 40 }, ...opcoes, children: Array.isArray(filhos) ? filhos : [filhos] });
  const marcado = (texto, opcoes = {}) => new Paragraph({ numbering: { reference: 'check', level: 0 }, spacing: { before: 0, after: 30 }, children: [run(texto, opcoes)] });
  const vazioSeNada = (lista) => (lista.length ? lista : [par(run('—'))]);

  const celula = (filhos, largura, { fundo, span, centro = false, vertical = VerticalAlign.TOP } = {}) => new TableCell({
    width: { size: largura, type: WidthType.DXA },
    borders: bordas,
    margins: margens,
    verticalAlign: vertical,
    ...(span ? { columnSpan: span } : {}),
    ...(fundo ? { shading: { fill: fundo, type: ShadingType.CLEAR, color: 'auto' } } : {}),
    children: (Array.isArray(filhos) ? filhos : [filhos]).map((f) => (typeof f === 'string'
      ? par(run(f, { bold: Boolean(fundo) }), { alignment: centro ? AlignmentType.CENTER : AlignmentType.LEFT })
      : f)),
  });
  const titulo = (texto, largura, fundo, opcoes = {}) => celula(par(run(texto, { bold: true, size: opcoes.tamanho || 20 }), { alignment: AlignmentType.CENTER }), largura, { fundo, vertical: VerticalAlign.CENTER, ...opcoes });

  // ---------- ficha de identificação ----------
  const L1 = 2300;
  const L2 = 3500;
  const L3 = 1700;
  const L4 = LARGURA - L1 - L2 - L3;
  const rotulo = (t, l = L1) => celula(t.toUpperCase(), l, { fundo: CINZA, vertical: VerticalAlign.CENTER });
  const linhaLarga = (r, filhos) => new TableRow({ children: [rotulo(r), celula(filhos, L2 + L3 + L4, { span: 3 })] });

  const competenciasGerais = (p.competencias_gerais || []).filter((n) => COMPETENCIAS_GERAIS[n]);
  const competenciasEspecificas = (p.competencias_especificas || []).filter((n) => COMPETENCIAS_ESPECIFICAS[n]);

  const ficha = new Table({
    width: { size: LARGURA, type: WidthType.DXA },
    columnWidths: [L1, L2, L3, L4],
    rows: [
      new TableRow({ children: [rotulo('Área do conhecimento'), celula(par(run('Matemática e suas Tecnologias', { bold: true })), L2), rotulo('Ano/Série', L3), celula(par(run(serie, { bold: true })), L4)] }),
      new TableRow({ children: [rotulo('Componente curricular'), celula('Matemática', L2), rotulo('Bimestre', L3), celula(sequencia.bimestre ? ordinal(sequencia.bimestre) : '—', L4)] }),
      new TableRow({ children: [rotulo('Professor(a)'), celula(cab.professor || '', L2), rotulo('Turma', L3), celula(cab.turma || '', L4)] }),
      linhaLarga('Carga horária', `${itens.length || sequencia.quantidade} aulas no bimestre`),
      linhaLarga('Ementa', p.ementa || sequencia.conteudos),
      linhaLarga('Competências gerais', vazioSeNada(competenciasGerais.map((n) => par(run(`${n}. ${COMPETENCIAS_GERAIS[n]}`))))),
      linhaLarga('Competências específicas', vazioSeNada(competenciasEspecificas.map((n) => par([run(`${n}. `, { bold: true }), run(COMPETENCIAS_ESPECIFICAS[n])])))),
      linhaLarga('Critérios de avaliação', [
        ...vazioSeNada((p.avaliacao || []).map((a) => marcado(a))),
        ...(p.recuperacao ? [par(run(`Recuperação: ${p.recuperacao}`), { spacing: { before: 80, after: 0 } })] : []),
      ]),
    ],
  });

  // ---------- tabela do bimestre (habilidades | objetivos | conteúdos) ----------
  const C1 = 4000;
  const C2 = 3150;
  const C3 = LARGURA - C1 - C2;
  const habilidades = (p.habilidades || []).map((h) => par([run(`${h.codigo} - `, { bold: true }), run(h.descricao)], { spacing: { before: 0, after: 80 } }));
  const objetivos = (p.objetivos || []).map((o) => marcado(o));
  const conteudos = (p.conteudos || []).flatMap((c, i) => [
    par(run(c.tema, { bold: true }), { spacing: { before: i ? 120 : 0, after: 40 } }),
    ...c.topicos.map((t) => marcado(t)),
  ]);
  const professor = cab.professor ? `PROF. ${cab.professor.toUpperCase()}` : 'PROFESSOR(A)';

  const tabelaBimestre = new Table({
    width: { size: LARGURA, type: WidthType.DXA },
    columnWidths: [C1, C2, C3],
    rows: [
      new TableRow({ tableHeader: true, children: [titulo('MATEMÁTICA', C1, CINZA_ESCURO), titulo(professor, C2, CINZA_ESCURO), titulo(`${ordinal(sequencia.serie)} ANO MÉDIO`, C3, CINZA_ESCURO)] }),
      new TableRow({ tableHeader: true, children: [titulo(bimestre, LARGURA, LARANJA, { span: 3, tamanho: 26 })] }),
      new TableRow({ tableHeader: true, children: [titulo('HABILIDADES (BNCC)', C1, CINZA), titulo('OBJETIVOS DE APRENDIZAGEM', C2, CINZA), titulo('CONTEÚDOS', C3, CINZA)] }),
      new TableRow({ children: [celula(vazioSeNada(habilidades), C1), celula(vazioSeNada(objetivos), C2), celula(vazioSeNada(conteudos), C3)] }),
    ],
  });

  // ---------- sequência de aulas ----------
  const S1 = 800;
  const S2 = 2700;
  const S3 = 3400;
  const S4 = LARGURA - S1 - S2 - S3;
  const tabelaAulas = new Table({
    width: { size: LARGURA, type: WidthType.DXA },
    columnWidths: [S1, S2, S3, S4],
    rows: [
      new TableRow({ tableHeader: true, children: [titulo('SEQUÊNCIA DE AULAS', LARGURA, LARANJA, { span: 4, tamanho: 22 })] }),
      new TableRow({ tableHeader: true, children: [titulo('AULA', S1, CINZA), titulo('ASSUNTO', S2, CINZA), titulo('OBJETIVO', S3, CINZA), titulo('ENCAMINHAMENTO', S4, CINZA)] }),
      ...itens.map((i) => new TableRow({ cantSplit: true, children: [
        celula(par(run(String(i.ordem), { bold: true }), { alignment: AlignmentType.CENTER }), S1),
        celula(par(run(i.assunto, { bold: true })), S2),
        celula(i.objetivo || '', S3),
        celula(i.observacoes || '', S4),
      ] })),
    ],
  });

  const cabecalhoDoc = [
    ...(cab.escola ? [par(run(cab.escola.toUpperCase(), { bold: true, size: 24 }), { alignment: AlignmentType.CENTER })] : []),
    par(run(`PLANEJAMENTO DO ${bimestre} · MATEMÁTICA · ${ordinal(sequencia.serie).toUpperCase()} ANO`, { bold: true, size: 28 }), { alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 } }),
    par(run('Alinhado à BNCC (Ensino Médio)', { size: 20 }), { alignment: AlignmentType.CENTER, spacing: { before: 0, after: 200 } }),
  ];

  return new Document({
    creator: cab.professor || 'Proff',
    title: `Planejamento ${sequencia.bimestre ? `${sequencia.bimestre}º bimestre` : 'bimestral'} - ${sequencia.titulo || 'Matemática'}`,
    styles: { default: { document: { run: { font: FONTE, size: 20 } } } },
    numbering: {
      config: [
        { reference: 'check', levels: [{ level: 0, format: LevelFormat.BULLET, text: '✓', alignment: AlignmentType.LEFT, style: { run: { font: 'Segoe UI Symbol' }, paragraph: { indent: { left: 280, hanging: 220 } } } }] },
        { reference: 'numero', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 260 } } } }] },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 850, bottom: 850, left: 850, right: 850 } } },
      children: [
        ...cabecalhoDoc,
        ficha,
        new Paragraph({ children: [new PageBreak()] }),
        tabelaBimestre,
        par(run(''), { spacing: { before: 0, after: 200 } }),
        tabelaAulas,
        par(run('Gerado pelo Proff. As descrições das habilidades são resumos; consulte o texto oficial em basenacionalcomum.mec.gov.br. Revise antes de entregar.', { size: 16, italics: true }), { spacing: { before: 200, after: 0 } }),
      ],
    }],
  });
}

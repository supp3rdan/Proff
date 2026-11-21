// POST /api/gerar — cada requisição faz UMA etapa pequena da geração.
// Corpo: { tipo, serie, assunto, observacoes?, ...dados da etapa }
//   visao     → visão geral do tema
//   plano     → plano de aula            (visao)
//   material  → material de uma parte    (plano, visao, secao)
//   formatar  → slides de uma parte      (secao, material)
//   questoes  → questões da prova        (plano, visao, tipoQuestao: multipla|discursiva)
//   conferir  → confere o gabarito       (questoes)
// Funciona como função serverless da Vercel e também pelo server.js local.

import {
  gerarVisaoGeral,
  gerarPlano,
  gerarMaterial,
  formatarSlides,
  gerarQuestoes,
  conferirProva,
  validarEntrada,
  ErroEntrada,
} from '../public/core/gerador.js';
import { ErroLLM } from '../public/core/llm.js';
import { clienteDoAmbiente } from '../lib/ambiente.js';
import { senhaConfere, enviarJSON, lerCorpo } from '../lib/http.js';

export const config = { maxDuration: 120 };

const objeto = (v, nome) => {
  if (!v || typeof v !== 'object') throw new ErroEntrada(`Faltou ${nome}.`);
  return v;
};

const ETAPAS = {
  visao: (llm, e) => gerarVisaoGeral(llm, e),
  plano: (llm, e, c) => gerarPlano(llm, e, c.visao),
  material: (llm, e, c) => gerarMaterial(llm, e, objeto(c.plano, 'o plano de aula'), c.visao, c.secao),
  formatar: (llm, e, c) => formatarSlides(llm, e, c.secao, objeto(c.material, 'o material')),
  questoes: (llm, e, c) => gerarQuestoes(llm, e, objeto(c.plano, 'o plano de aula'), c.visao, c.tipoQuestao),
  conferir: (llm, e, c) => {
    if (!Array.isArray(c.questoes) || !c.questoes.length) throw new ErroEntrada('Faltaram as questões.');
    return conferirProva(llm, c.questoes);
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return enviarJSON(res, 405, { erro: 'Use POST.' });
  if (!senhaConfere(req)) return enviarJSON(res, 401, { erro: 'Código de acesso inválido.' });

  try {
    const corpo = await lerCorpo(req);
    const entrada = validarEntrada(corpo);
    const etapa = ETAPAS[corpo.tipo];
    if (!etapa) throw new ErroEntrada(`Tipo inválido. Use: ${Object.keys(ETAPAS).join(', ')}.`);
    return enviarJSON(res, 200, await etapa(clienteDoAmbiente(), entrada, corpo));
  } catch (erro) {
    if (erro instanceof ErroEntrada) return enviarJSON(res, 400, { erro: erro.message });
    if (erro instanceof ErroLLM) return enviarJSON(res, 503, { erro: erro.message });
    console.error('[api/gerar]', erro);
    return enviarJSON(res, 500, { erro: erro.message || 'Erro inesperado.' });
  }
}

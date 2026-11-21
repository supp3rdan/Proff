// Fluxo de geração. Recebe o cliente de IA (criarClienteLLM) como parâmetro,
// então funciona igual no servidor e no navegador.
import {
  promptPlano,
  promptSlides,
  promptProva,
  promptResolver,
  promptComparar,
} from './prompts.js?v=__VERSAO__';

export class ErroEntrada extends Error {}

export function validarEntrada(corpo) {
  const serie = String(corpo?.serie ?? '').trim();
  const assunto = String(corpo?.assunto ?? '').trim();
  const observacoes = String(corpo?.observacoes ?? '').trim();

  if (!['1', '2', '3'].includes(serie)) throw new ErroEntrada('Escolha a série (1º, 2º ou 3º ano).');
  if (!assunto) throw new ErroEntrada('Informe o assunto.');
  if (assunto.length > 150) throw new ErroEntrada('O assunto deve ter no máximo 150 caracteres.');
  if (observacoes.length > 1500) throw new ErroEntrada('As observações devem ter no máximo 1500 caracteres.');

  return { serie, assunto, observacoes };
}

export async function gerarPlano(llm, entrada) {
  const { dados, provedor } = await llm.gerarJSON({ ...promptPlano(entrada), tarefa: 'plano' });
  if (!Array.isArray(dados.etapas)) throw new Error('Plano gerado sem etapas.');
  return { plano: dados, provedor };
}

export async function gerarSlides(llm, entrada, plano) {
  const { dados, provedor } = await llm.gerarJSON({ ...promptSlides(entrada, plano), tarefa: 'slides' });
  if (!Array.isArray(dados.slides) || dados.slides.length === 0) throw new Error('Nenhum slide gerado.');
  return { slides: dados, provedor };
}

/**
 * Gera a prova e confere o gabarito: outro pedido (de preferência em outro
 * provedor) resolve as questões sem ver as respostas. Questões em que as
 * respostas não batem são marcadas para revisão do professor.
 */
export async function gerarProva(llm, entrada, plano) {
  const { dados: prova, provedor } = await llm.gerarJSON({
    ...promptProva(entrada, plano),
    tarefa: 'prova',
  });
  if (!Array.isArray(prova.questoes) || prova.questoes.length === 0) throw new Error('Prova gerada sem questões.');

  prova.questoes.forEach((q, i) => {
    q.numero = i + 1;
    q.alternativas = Array.isArray(q.alternativas) ? q.alternativas : [];
    if (q.alternativas.length === 0) q.tipo = 'discursiva';
  });

  let verificacao;
  try {
    verificacao = await verificarGabarito(llm, prova.questoes);
  } catch (erro) {
    console.warn('[prova] verificação não concluída:', erro.message);
    verificacao = { concluida: false, motivo: erro.message };
  }

  return { prova, verificacao, provedor };
}

async function verificarGabarito(llm, questoes) {
  const { dados, provedor } = await llm.gerarJSON({
    ...promptResolver(questoes),
    tarefa: 'resolver',
    comecarPor: 1,
    temperatura: 0.1,
  });
  const respostas = new Map((dados.respostas || []).map((r) => [Number(r.numero), String(r.resposta ?? '')]));

  const discursivas = [];
  for (const q of questoes) {
    const doVerificador = respostas.get(q.numero);
    q.verificacao = { resposta_verificador: doVerificador ?? null, confere: null };
    if (doVerificador == null) continue;

    if (q.tipo === 'multipla') {
      q.verificacao.confere = letra(doVerificador) === letra(q.resposta);
    } else if (normalizar(doVerificador) === normalizar(q.resposta)) {
      q.verificacao.confere = true;
    } else {
      discursivas.push({ numero: q.numero, resposta_a: String(q.resposta), resposta_b: doVerificador });
    }
  }

  if (discursivas.length) {
    const { dados: comp } = await llm.gerarJSON({
      ...promptComparar(discursivas),
      tarefa: 'comparar',
      temperatura: 0,
    });
    for (const c of comp.comparacoes || []) {
      const q = questoes.find((x) => x.numero === Number(c.numero));
      if (q) q.verificacao.confere = c.equivalentes === true;
    }
  }

  const revisar = questoes.filter((q) => q.verificacao.confere !== true).map((q) => q.numero);
  return { concluida: true, provedor, revisar };
}

function letra(texto) {
  const m = String(texto).trim().toUpperCase().match(/^\(?([A-E])\b/);
  return m ? m[1] : String(texto).trim().toUpperCase();
}

function normalizar(texto) {
  return String(texto)
    .toLowerCase()
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/,/g, '.')
    .replace(/^[a-z](\([a-z]\))?=/, '');
}

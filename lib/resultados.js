// Resumo dos resultados dos alunos nos jogos da aula interativa (para o painel do professor).

/** Texto curto de cada item de jogo, para mostrar quais foram mais errados. */
export function rotulosDosItens(jogos = {}) {
  const r = {};
  (jogos.quiz || []).forEach((q, i) => (r[`quiz:${i}`] = `Quiz ${i + 1}: ${q.pergunta}`));
  (jogos.verdadeiro_falso || []).forEach((v, i) => (r[`vf:${i}`] = `V ou F ${i + 1}: ${v.afirmacao}`));
  (jogos.pares || []).forEach((p, i) => (r[`par:${i}`] = `Par: ${p.termo} ↔ ${p.significado}`));
  (jogos.desafios || []).forEach((d, i) => (r[`desafio:${i}`] = `Desafio ${i + 1}: ${d.pergunta}`));
  return r;
}

/** Agrega os envios de uma aula: alunos, média e itens com mais erros. */
export function resumirResultados(resultados, jogos) {
  const rotulos = rotulosDosItens(jogos);
  const erros = {};
  for (const r of resultados) {
    for (const item of r.detalhes?.erros || []) erros[item] = (erros[item] || 0) + 1;
  }
  const media = resultados.length
    ? resultados.reduce((s, r) => s + r.acertos / r.total, 0) / resultados.length
    : null;
  return {
    envios: resultados.length,
    media,
    alunos: resultados
      .map((r) => ({ apelido: r.apelido, acertos: r.acertos, total: r.total, em: r.criado_em }))
      .sort((a, b) => String(b.em).localeCompare(String(a.em))),
    mais_errados: Object.entries(erros)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([item, vezes]) => ({ item, texto: rotulos[item] || item, vezes, percentual: vezes / resultados.length })),
  };
}

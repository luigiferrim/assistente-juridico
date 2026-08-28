/**
 * Testes da regra de terminação da paginação do DJEN.
 *
 * Esta suíte existe por um motivo específico e único: garantir que um erro da
 * API NUNCA seja confundido com fim da lista. Se este arquivo ficar verde
 * enquanto a implementação trata erro como fim, alguém perde um prazo.
 *
 * Rodar:  node --test spikes/lib/
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarTudo, DjenError } from "./djen.mjs";

const semPausa = async () => {};
const item = (id) => ({ id, texto: "..." });
const pagina = (n) => Array.from({ length: n }, (_, i) => item(i));

test("página incompleta encerra a coleta e marca completo", async () => {
  const buscar = async (_f, p) => (p === 1 ? pagina(100) : pagina(20));
  const r = await buscarTudo({}, { buscar, dormir: semPausa, itensPorPagina: 100 });
  assert.equal(r.completo, true);
  assert.equal(r.itens.length, 120);
  assert.equal(r.paginasLidas, 2);
});

test("primeira página exatamente cheia e segunda vazia ainda encerra como completo", async () => {
  const buscar = async (_f, p) => (p === 1 ? pagina(100) : []);
  const r = await buscarTudo({}, { buscar, dormir: semPausa, itensPorPagina: 100 });
  assert.equal(r.completo, true);
  assert.equal(r.itens.length, 100);
});

test("CRÍTICO: erro no meio da paginação NÃO pode ser tratado como fim", async () => {
  // Cenário real: HTTP 500 "O sistema está muito ocupado" na página 3.
  const buscar = async (_f, p) => {
    if (p <= 2) return pagina(100);
    throw new DjenError("HTTP 500 na página 3", { pagina: p });
  };
  const r = await buscarTudo({}, { buscar, dormir: semPausa, itensPorPagina: 100, tentativasPorPagina: 3 });

  assert.equal(r.completo, false, "coleta com erro JAMAIS pode ser reportada como completa");
  assert.equal(r.itens.length, 200, "os itens já lidos são preservados, mas marcados como parciais");
  assert.match(r.motivo, /falha na página 3/);
});

test("CRÍTICO: erro na primeira página não produz 'nenhuma comunicação hoje'", async () => {
  const buscar = async () => {
    throw new DjenError("HTTP 500");
  };
  const r = await buscarTudo({}, { buscar, dormir: semPausa, tentativasPorPagina: 2 });

  assert.equal(r.completo, false);
  assert.equal(r.itens.length, 0);
  // A distinção que importa: 0 itens + completo:false ≠ 0 itens + completo:true.
  // O painel deve dizer "a fonte falhou", nunca "não há nada".
});

test("erro transitório é superado pelo retry e a coleta segue completa", async () => {
  let falhasRestantes = 2;
  const buscar = async (_f, p) => {
    if (p === 2 && falhasRestantes-- > 0) throw new DjenError("500 transitório");
    return p === 1 ? pagina(100) : pagina(7);
  };
  const r = await buscarTudo({}, { buscar, dormir: semPausa, itensPorPagina: 100, tentativasPorPagina: 3 });
  assert.equal(r.completo, true);
  assert.equal(r.itens.length, 107);
});

test("estourar o teto de páginas não conta como completo", async () => {
  const buscar = async () => pagina(100); // nunca acaba
  const r = await buscarTudo({}, { buscar, dormir: semPausa, itensPorPagina: 100, maxPaginas: 3 });
  assert.equal(r.completo, false);
  assert.match(r.motivo, /teto de 3 páginas/);
});

test("o campo count da API não influencia a terminação", async () => {
  // count mentiroso (S2.1) em todas as páginas; só o tamanho do lote decide.
  const buscar = async (_f, p) => (p === 1 ? pagina(100) : pagina(3));
  const r = await buscarTudo({}, { buscar, dormir: semPausa, itensPorPagina: 100 });
  assert.equal(r.completo, true);
  assert.equal(r.itens.length, 103);
});

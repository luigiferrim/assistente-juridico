#!/usr/bin/env node
/**
 * Cobertura da suíte — o relatório nativo do node:test, sem ferramenta externa.
 *
 * Roda a suíte com `--experimental-test-coverage`, lê o LCOV que o próprio Node
 * emite e monta um resumo em Markdown: tabela por arquivo, totais e — a parte
 * honesta — a lista dos módulos de `src/` que a suíte NÃO carrega. O Node só
 * mede o que executou: um arquivo nunca importado não aparece no relatório, e a
 * porcentagem "de todos os arquivos" seria, na verdade, só dos que foram
 * tocados. Por isso não há badge de cobertura: o número sozinho enganaria.
 *
 * Uso:  node ferramentas/cobertura.mjs
 * Saída: cobertura/lcov.info + cobertura/resumo.md (e o resumo no stdout).
 * Na CI o resumo vai para $GITHUB_STEP_SUMMARY.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR_SAIDA = join(RAIZ, "cobertura");

/** Lê um LCOV e devolve um registro por arquivo: { arquivo, linhas: {t, c}, ramos: {t, c}, funcoes: {t, c} }. */
export function lerLcov(texto) {
  const registros = [];
  let atual = null;
  for (const linha of texto.split(/\r?\n/)) {
    const [chave, valor] = linha.split(":");
    if (chave === "SF") atual = { arquivo: valor, linhas: { t: 0, c: 0 }, ramos: { t: 0, c: 0 }, funcoes: { t: 0, c: 0 } };
    else if (!atual) continue;
    else if (chave === "LF") atual.linhas.t = Number(valor);
    else if (chave === "LH") atual.linhas.c = Number(valor);
    else if (chave === "BRF") atual.ramos.t = Number(valor);
    else if (chave === "BRH") atual.ramos.c = Number(valor);
    else if (chave === "FNF") atual.funcoes.t = Number(valor);
    else if (chave === "FNH") atual.funcoes.c = Number(valor);
    else if (linha === "end_of_record") {
      registros.push(atual);
      atual = null;
    }
  }
  return registros.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
}

const pct = ({ t, c }) => (t === 0 ? "—" : `${((100 * c) / t).toFixed(1)}%`);

/** Resumo em Markdown. `naoMedidos` são os módulos de src/ que nenhum teste importou. */
export function resumoMarkdown(registros, naoMedidos, { testes = null, falhas = 0 } = {}) {
  const soma = (campo) => registros.reduce((acc, r) => ({ t: acc.t + r[campo].t, c: acc.c + r[campo].c }), { t: 0, c: 0 });
  const totais = { linhas: soma("linhas"), ramos: soma("ramos"), funcoes: soma("funcoes") };
  const l = [];
  l.push("## Cobertura da suíte (node:test, nativo)");
  l.push("");
  if (testes !== null) l.push(`Suíte: **${testes} testes**${falhas ? `, **${falhas} falhando**` : ", todos passando"}.`);
  l.push("");
  l.push("| Arquivo | Linhas | Ramos | Funções |");
  l.push("|---|---:|---:|---:|");
  for (const r of registros) l.push(`| \`${r.arquivo}\` | ${pct(r.linhas)} | ${pct(r.ramos)} | ${pct(r.funcoes)} |`);
  l.push(
    `| **${registros.length} módulo(s) medido(s)** | **${pct(totais.linhas)}** (${totais.linhas.c}/${totais.linhas.t}) | **${pct(totais.ramos)}** (${totais.ramos.c}/${totais.ramos.t}) | **${pct(totais.funcoes)}** (${totais.funcoes.c}/${totais.funcoes.t}) |`,
  );
  l.push("");
  if (naoMedidos.length) {
    l.push(`### ${naoMedidos.length} módulo(s) de \`src/\` fora da medição`);
    l.push("");
    l.push("O Node só mede o que a suíte executou. Estes arquivos nenhum teste importa, então os totais acima **não os incluem**:");
    l.push("");
    for (const a of naoMedidos) l.push(`- \`${a}\``);
    l.push("");
    l.push(
      `Leitura honesta: ${registros.length} de ${registros.length + naoMedidos.length} módulos medidos. Pontos de entrada (CLI, worker, cargas) e o cofre de segredos (Keychain do macOS) ficam de fora por desenho — a suíte é hermética e não toca máquina, rede nem cofre.`,
    );
  } else {
    l.push("Todos os módulos de `src/` foram carregados pela suíte.");
  }
  return l.join("\n");
}

function modulosDeSrc() {
  return execFileSync("git", ["ls-files", "-z", "src/**/*.mjs", "src/*.mjs"], { cwd: RAIZ, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
}

function principal() {
  mkdirSync(DIR_SAIDA, { recursive: true });
  const lcov = join(DIR_SAIDA, "lcov.info");
  const r = spawnSync(
    process.execPath,
    [
      "--test",
      "--experimental-test-coverage",
      "--test-coverage-include=src/**",
      "--test-reporter=tap",
      "--test-reporter-destination=stdout",
      "--test-reporter=lcov",
      `--test-reporter-destination=${lcov}`,
      "tests/**/*.test.mjs",
    ],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 26 },
  );
  const testes = Number(r.stdout.match(/^# tests (\d+)$/m)?.[1] ?? NaN);
  const falhas = Number(r.stdout.match(/^# fail (\d+)$/m)?.[1] ?? 0);
  if (Number.isNaN(testes)) {
    console.error(r.stdout, r.stderr);
    throw new Error("a suíte não produziu o resumo TAP");
  }

  const registros = lerLcov(readFileSync(lcov, "utf8"));
  const medidos = new Set(registros.map((x) => x.arquivo));
  const naoMedidos = modulosDeSrc().filter((a) => !medidos.has(a));
  const md = resumoMarkdown(registros, naoMedidos, { testes, falhas });

  writeFileSync(join(DIR_SAIDA, "resumo.md"), `${md}\n`);
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  process.exit(falhas || r.status ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();

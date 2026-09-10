#!/usr/bin/env node
/**
 * O README não pode mentir.
 *
 * Os badges de "testes", "node", "dependências" e "licença" são imagens estáticas
 * do shields.io — não há serviço contando nada. O que os torna honestos é este
 * script: ele conta os testes de verdade (rodando a suíte), lê o package.json e
 * falha se o README disser outra coisa. Roda na CI depois da suíte; se alguém
 * acrescenta um teste e esquece o README, o build quebra.
 *
 * Uso: node ferramentas/verificar-readme.mjs
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Roda `node --test` sobre os padrões e devolve quantos testes existem (e quantos falharam). */
export function contarTestes(padroes) {
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "--test-reporter-destination=stdout", ...padroes], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 1 << 26,
  });
  const total = r.stdout.match(/^# tests (\d+)$/m);
  if (!total) throw new Error(`não encontrei "# tests N" na saída de: ${padroes.join(" ")}\n${r.stderr}`);
  return { total: Number(total[1]), falhas: Number(r.stdout.match(/^# fail (\d+)$/m)?.[1] ?? 0) };
}

/** Os fatos que o README afirma, lidos da fonte — nunca do próprio README. */
export function fatosDoCodigo({ base, spikes, pkg }) {
  return {
    testesTotal: base + spikes,
    testesBase: base,
    testesSpikes: spikes,
    nodeMinimo: String(pkg.engines?.node ?? "").replace(/^>=\s*/, ""),
    dependencias: Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length,
    licenca: pkg.license,
  };
}

/** Compara o README com os fatos. Devolve a lista de divergências (vazia = README honesto). */
export function conferirReadme(readme, fatos) {
  const divergencias = [];
  const pegar = (nome, re) => {
    const m = readme.match(re);
    if (!m) divergencias.push(`${nome}: trecho não encontrado no README`);
    return m ? m[1] : null;
  };
  const igual = (nome, encontrado, esperado) => {
    if (encontrado !== null && String(encontrado) !== String(esperado)) {
      divergencias.push(`${nome}: README diz "${encontrado}", código tem "${esperado}"`);
    }
  };

  igual("badge de testes", pegar("badge de testes", /img\.shields\.io\/badge\/testes-(\d+)-/), fatos.testesTotal);

  const stack = readme.match(/\*\*(\d+) testes\*\* \((\d+) de fundação[^)]*\+ (\d+) dos spikes\)/);
  if (!stack) divergencias.push("tabela Stack: linha '**N testes** (B de fundação… + S dos spikes)' não encontrada");
  else {
    igual("tabela Stack, total", stack[1], fatos.testesTotal);
    igual("tabela Stack, fundação", stack[2], fatos.testesBase);
    igual("tabela Stack, spikes", stack[3], fatos.testesSpikes);
  }

  igual("comentário de `npm test`", pegar("comentário de `npm test`", /npm test\s+#\s*(\d+) testes/), fatos.testesBase);
  igual("comentário de `npm run test:tudo`", pegar("comentário de `npm run test:tudo`", /npm run test:tudo\s+#.*?= (\d+)/), fatos.testesTotal);

  const node = pegar("badge do Node", /img\.shields\.io\/badge\/node-([^-]+)-/);
  igual("badge do Node", node === null ? null : decodeURIComponent(node), `≥ ${fatos.nodeMinimo}`);

  igual("badge de dependências", pegar("badge de dependências", /img\.shields\.io\/badge\/depend%C3%AAncias_npm-(\d+)-/), fatos.dependencias);

  const licencaEsperada = fatos.licenca === "UNLICENSED" ? "todos_os_direitos_reservados" : fatos.licenca;
  igual("badge de licença", pegar("badge de licença", /img\.shields\.io\/badge\/licen%C3%A7a-([^-]+)-/), licencaEsperada);

  return divergencias;
}

function principal() {
  const base = contarTestes(["tests/**/*.test.mjs"]);
  const spikes = contarTestes(["spikes/**/*.test.mjs"]);
  const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  const fatos = fatosDoCodigo({ base: base.total, spikes: spikes.total, pkg });
  const divergencias = conferirReadme(readFileSync(join(RAIZ, "README.md"), "utf8"), fatos);

  const linhas = [
    "## README × código",
    "",
    "| Fato | Valor medido |",
    "|---|---|",
    `| Testes (fundação + ferramentas) | ${fatos.testesBase}${base.falhas ? ` — **${base.falhas} falhando**` : ""} |`,
    `| Testes (spikes) | ${fatos.testesSpikes}${spikes.falhas ? ` — **${spikes.falhas} falhando**` : ""} |`,
    `| Total | ${fatos.testesTotal} |`,
    `| Node mínimo | ≥ ${fatos.nodeMinimo} |`,
    `| Dependências npm (runtime + dev) | ${fatos.dependencias} |`,
    `| Licença | ${fatos.licenca} |`,
    "",
    divergencias.length ? `### ❌ README diverge do código (${divergencias.length})` : "### ✅ README confere com o código",
    ...divergencias.map((d) => `- ${d}`),
  ];
  const md = linhas.join("\n");
  console.log(md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  process.exit(divergencias.length || base.falhas || spikes.falhas ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();

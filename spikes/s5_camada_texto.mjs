/**
 * S5 — Os PDFs do PJe têm camada de texto? A verificação de citação funciona?
 *
 * SPIKE. Somente leitura, nenhum dado sai da máquina, nada é gravado.
 *
 * Roda sobre os arquivos REAIS em `atas das audiencias/` e mede quatro coisas:
 *
 *   1. Camada de texto — existe, e o texto sai legível? (não é a mesma pergunta)
 *   2. Ordem de leitura — quanto a extração ingênua embaralha?
 *   3. Verificação de citação (v2 §1.2-b) — que nível de normalização é preciso
 *      para uma citação correta ser aprovada?
 *   4. Anti-alucinação — um trecho adulterado é sempre reprovado?
 *
 * Rodar:  node spikes/s5_camada_texto.mjs ["pasta"]
 */

import fs from "node:fs";
import path from "node:path";
import {
  detectarCamadaDeTexto,
  extrairNumerosCnj,
  extrairTexto,
  extrairValores,
  repararNumerosCnj,
  unirQuebrasDeHifen,
  verificarCitacao,
} from "./lib/pdf_texto.mjs";

const PASTA = process.argv[2] ?? "atas das audiencias";

/** Espaçamento de amostragem dos trechos, em caracteres. */
const PASSO_TRECHO = 400;
/** Tamanho alvo de cada trecho citado, em caracteres. */
const TAM_TRECHO = 120;

/**
 * Gera trechos como um MODELO os citaria: frase corrida, sem as quebras de
 * linha internas do PDF. É esse formato que chega no campo `trecho` da
 * extração, e é contra o texto cru do documento que ele precisa conferir.
 */
function trechosCitaveis(texto) {
  const trechos = [];
  for (let i = 0; i + TAM_TRECHO < texto.length; i += PASSO_TRECHO) {
    let bruto = texto.slice(i, i + TAM_TRECHO);
    // Corta nas bordas de palavra para não citar meia sílaba.
    bruto = bruto.replace(/^\S*\s/, "").replace(/\s\S*$/, "");
    const citado = unirQuebrasDeHifen(bruto).replace(/\s+/g, " ").trim();
    if (citado.length >= 40) trechos.push(citado);
  }
  return trechos;
}

/** Adultera o primeiro dígito — simula alucinação plausível de valor/data/prazo. */
function adulterar(trecho) {
  const m = /\d/.exec(trecho);
  if (!m) return null;
  const d = Number(m[0]);
  return trecho.slice(0, m.index) + ((d + 1) % 10) + trecho.slice(m.index + 1);
}

function pct(n, total) {
  return total === 0 ? "  n/a" : `${((100 * n) / total).toFixed(1).padStart(5)}%`;
}

const arquivos = fs
  .readdirSync(PASTA)
  .filter((f) => f.toLowerCase().endsWith(".pdf"))
  .sort();

if (arquivos.length === 0) {
  console.error(`Nenhum PDF em "${PASTA}".`);
  process.exit(1);
}

console.log(`S5 — camada de texto e verificação de citação`);
console.log(`Pasta: ${PASTA} · ${arquivos.length} arquivos\n`);

const geral = {
  arquivos: 0,
  utilizaveis: 0,
  semCamada: 0,
  ilegiveis: 0,
  cnjSemReparo: 0,
  cnjComReparo: 0,
  cnjDistintos: 0,
  trechos: 0,
  porNivel: { literal: 0, espacos: 0, hifen: 0, alfanumerico: 0 },
  reprovados: 0,
  reprovadosIngenuo: 0,
  adulterados: 0,
  adulteradosDetectados: 0,
  valores: 0,
};

console.log("═".repeat(100));
console.log(
  "arquivo".padEnd(24) +
    "veredicto".padEnd(20) +
    "chars".padStart(7) +
    "CMap".padStart(8) +
    "CNJ s→c".padStart(8) +
    "R$".padStart(5) +
    "trechos".padStart(9) +
    "reprov".padStart(8) +
    "ingênuo✗".padStart(10),
);
console.log("═".repeat(100));

for (const nome of arquivos) {
  const buffer = fs.readFileSync(path.join(PASTA, nome));

  const d = detectarCamadaDeTexto(buffer);
  const textoOrdenado = d.texto;
  const textoIngenuo = extrairTexto(buffer, { ordenarPorPosicao: false }).texto;

  geral.arquivos++;
  if (d.veredicto === "camada_utilizavel") geral.utilizaveis++;
  else if (d.veredicto === "sem_camada_de_texto") geral.semCamada++;
  else geral.ilegiveis++;

  // CNJ — com e sem o reparo da quebra de linha.
  //
  // Conta OCORRÊNCIAS, não números distintos. Contar distintos esconderia
  // exatamente o problema: a capa do PJe repete o número numa linha só, então o
  // documento continua "tendo" o número mesmo quando a ocorrência do corpo se
  // perdeu na quebra. É no corpo que o número acompanha o fato.
  const ocorrencias = (t) => (t.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g) ?? []).length;
  const cnjSem = ocorrencias(textoOrdenado);
  const cnjCom = ocorrencias(repararNumerosCnj(textoOrdenado));
  geral.cnjDistintos += extrairNumerosCnj(textoOrdenado).length;
  geral.cnjSemReparo += cnjSem;
  geral.cnjComReparo += cnjCom;

  const valores = extrairValores(textoOrdenado);
  geral.valores += valores.length;

  // Verificação de citação.
  const trechos = trechosCitaveis(textoOrdenado);
  let reprovados = 0;
  let reprovadosIngenuo = 0;
  for (const t of trechos) {
    geral.trechos++;
    const r = verificarCitacao(t, textoOrdenado);
    if (r.verificado) geral.porNivel[r.nivel]++;
    else {
      reprovados++;
      geral.reprovados++;
    }
    if (!verificarCitacao(t, textoIngenuo).verificado) {
      reprovadosIngenuo++;
      geral.reprovadosIngenuo++;
    }
    const falso = adulterar(t);
    if (falso) {
      geral.adulterados++;
      if (!verificarCitacao(falso, textoOrdenado).verificado) geral.adulteradosDetectados++;
    }
  }

  console.log(
    nome.padEnd(24) +
      d.veredicto.padEnd(20) +
      String(textoOrdenado.length).padStart(7) +
      String(d.diagnostico.codigosNoCMap).padStart(8) +
      `${cnjSem}→${cnjCom}`.padStart(8) +
      String(valores.length).padStart(5) +
      String(trechos.length).padStart(9) +
      String(reprovados).padStart(8) +
      String(reprovadosIngenuo).padStart(10),
  );
}

console.log("═".repeat(100));
console.log();

console.log("1. CAMADA DE TEXTO");
console.log(`   utilizável ............... ${geral.utilizaveis}/${geral.arquivos}`);
console.log(`   sem camada (escaneado) ... ${geral.semCamada}/${geral.arquivos}`);
console.log(`   presente mas ilegível .... ${geral.ilegiveis}/${geral.arquivos}`);
console.log();

console.log("2. NÚMERO DO PROCESSO (ocorrências, não números distintos)");
console.log(`   encontradas sem reparo ... ${geral.cnjSemReparo}`);
console.log(`   encontradas com reparo ... ${geral.cnjComReparo}`);
console.log(
  `   PERDIDAS sem o reparo .... ${geral.cnjComReparo - geral.cnjSemReparo}  ${pct(geral.cnjComReparo - geral.cnjSemReparo, geral.cnjComReparo)}`,
);
console.log(`   processos distintos ...... ${geral.cnjDistintos} em ${geral.arquivos} atas`);
console.log();

console.log("3. VERIFICAÇÃO DE CITAÇÃO — nível necessário");
for (const nivel of ["literal", "espacos", "hifen", "alfanumerico"]) {
  console.log(`   ${nivel.padEnd(14)} ${String(geral.porNivel[nivel]).padStart(5)}  ${pct(geral.porNivel[nivel], geral.trechos)}`);
}
console.log(`   ${"REPROVADOS".padEnd(14)} ${String(geral.reprovados).padStart(5)}  ${pct(geral.reprovados, geral.trechos)}`);
console.log(`   total de trechos testados: ${geral.trechos}`);
console.log();

console.log("4. ORDEM DE LEITURA — estrago da extração ingênua");
console.log(
  `   citações corretas REPROVADAS por ordem errada: ${geral.reprovadosIngenuo}/${geral.trechos}  ${pct(geral.reprovadosIngenuo, geral.trechos)}`,
);
console.log();

console.log("5. ANTI-ALUCINAÇÃO — trecho adulterado (1 dígito)");
console.log(
  `   detectados: ${geral.adulteradosDetectados}/${geral.adulterados}  ${pct(geral.adulteradosDetectados, geral.adulterados)}`,
);
console.log();

console.log(`6. VALORES MONETÁRIOS normalizados para centavos: ${geral.valores}`);
console.log();

const falhou =
  geral.semCamada > 0 ||
  geral.ilegiveis > 0 ||
  geral.reprovados > 0 ||
  geral.adulteradosDetectados !== geral.adulterados;
console.log(falhou ? "⚠️  Há falhas acima — ver relatório S5." : "✅ Sem falhas nas quatro medições.");

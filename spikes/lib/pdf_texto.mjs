/**
 * Extração de texto de PDF e verificação de citação literal — SPIKE S5.
 *
 * Responde à pergunta do S5: os PDFs do PJe têm camada de texto, e o mecanismo
 * anti-alucinação da v2 (§1.2-b: conferir por string match se o trecho citado
 * existe mesmo no documento) funciona sobre o texto extraído?
 *
 * ⚠️ CÓDIGO DESCARTÁVEL. Não é o extrator de produção. Ele existe para MEDIR o
 * problema com os arquivos reais, não para resolvê-lo. A Fase 3 deve usar uma
 * biblioteca madura (pdfjs-dist) — ver §"Limitações" no relatório S5.
 *
 * Zero dependências: usa só `node:zlib`. Coerente com a decisão D8.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TRÊS ARMADILHAS QUE ESTE MÓDULO EXISTE PARA DEMONSTRAR
 *
 * 1. ENCODING PRÓPRIO (CMap /ToUnicode).
 *    As fontes do corpo da ata são subconjuntos com codificação própria. Sem
 *    aplicar o CMap, "PODER JUDICIÁRIO" sai como "3 2 ' ( 5  - 8 ' &  5 2".
 *    Um extrator que ignore /ToUnicode não devolve erro — devolve lixo com
 *    aparência de texto. É a pior forma de falhar.
 *
 * 2. ORDEM DE EMISSÃO ≠ ORDEM DE LEITURA.
 *    Texto em negrito é outra fonte, logo outro run, e o PJe o emite fora de
 *    ordem. O trecho "concedo à parte ré presente o prazo de 20 dias para
 *    apresentação de defesa" sai como "concedo à parte ré presente o | para |
 *    prazo de 20 dias | apresentação de defesa".
 *    O que se desloca é justamente o pedaço em negrito — e o que o PJe
 *    negrita é a QUANTIDADE DO PRAZO. A informação mais crítica do documento é
 *    a que embaralha. Corrigido aqui reordenando por posição na página.
 *
 * 3. QUEBRA DE LINHA DENTRO DO QUE SE QUER CITAR.
 *    Inclusive dentro do número do processo: "0900001-\n07.2026.5.12.0901".
 *
 * Se qualquer uma das três não for tratada, `verificarCitacao` reprova uma
 * extração CORRETA — e o sistema classificaria como alucinação um fato que o
 * modelo leu certo. O erro sairia caro na direção oposta à esperada.
 */

import zlib from "node:zlib";

export class PdfTextoError extends Error {
  constructor(mensagem, detalhes = {}) {
    super(mensagem);
    this.name = "PdfTextoError";
    this.detalhes = detalhes;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Estrutura do arquivo
// ─────────────────────────────────────────────────────────────────────────────

/** Mapa número do objeto → corpo cru. Suficiente para PDFs não-lineares simples. */
export function extrairObjetos(buffer) {
  const objetos = new Map();
  const re = /(\d+)\s+(\d+)\s+obj\b([\s\S]*?)endobj/g;
  const texto = buffer.toString("latin1");
  let m;
  while ((m = re.exec(texto)) !== null) {
    objetos.set(Number(m[1]), Buffer.from(m[3], "latin1"));
  }
  return objetos;
}

/** Descomprime o stream de um objeto. Devolve null se não houver ou não der. */
export function fluxoDoObjeto(corpo) {
  const texto = corpo.toString("latin1");
  const i = texto.indexOf("stream");
  if (i === -1) return null;
  let inicio = i + "stream".length;
  if (texto[inicio] === "\r") inicio++;
  if (texto[inicio] === "\n") inicio++;
  const fim = texto.indexOf("endstream", inicio);
  if (fim === -1) return null;

  const bruto = corpo.subarray(inicio, fim);
  if (!texto.slice(0, i).includes("/FlateDecode")) return bruto;
  try {
    return zlib.inflateSync(bruto);
  } catch {
    // Stream truncado no fim é comum; aproveitar o que deu para descomprimir é
    // melhor que descartar a página inteira.
    try {
      return zlib.inflateSync(bruto, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    } catch {
      return null;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CMap /ToUnicode  — armadilha 1
// ─────────────────────────────────────────────────────────────────────────────

/** Interpreta um CMap /ToUnicode: bfchar e bfrange. */
export function interpretarToUnicode(dados) {
  const texto = dados.toString("latin1");
  const mapa = new Map();

  for (const bloco of texto.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m;
    while ((m = re.exec(bloco)) !== null) {
      mapa.set(parseInt(m[1], 16), hexParaTexto(m[2]));
    }
  }

  for (const bloco of texto.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let m;
    while ((m = re.exec(bloco)) !== null) {
      const de = parseInt(m[1], 16);
      const ate = parseInt(m[2], 16);
      const base = parseInt(m[3], 16);
      // Faixa absurda = CMap malformado; ignorar em vez de estourar a memória.
      if (ate < de || ate - de > 65535) continue;
      for (let c = de; c <= ate; c++) mapa.set(c, String.fromCodePoint(base + c - de));
    }
  }
  return mapa;
}

function hexParaTexto(hex) {
  let saida = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const pedaco = hex.slice(i, i + 4);
    if (pedaco.length < 4) break;
    saida += String.fromCharCode(parseInt(pedaco, 16));
  }
  return saida;
}

/**
 * Une os CMaps de todas as fontes do documento.
 *
 * SIMPLIFICAÇÃO ASSUMIDA: um único mapa para o documento inteiro, em vez de um
 * por recurso de fonte (/F1, /F2...). Funciona nestes PDFs porque os
 * subconjuntos do PJe não conflitam entre si. Um extrator de produção NÃO pode
 * assumir isso — fontes diferentes podem mapear o mesmo código para letras
 * diferentes.
 */
export function mapaDeFontes(objetos) {
  const uniao = new Map();
  let comToUnicode = 0;
  let semToUnicode = 0;

  for (const corpo of objetos.values()) {
    const texto = corpo.toString("latin1");
    if (!texto.includes("/Font")) continue;
    const ref = texto.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!ref) {
      if (/\/Type\s*\/Font/.test(texto)) semToUnicode++;
      continue;
    }
    const alvo = objetos.get(Number(ref[1]));
    const fluxo = alvo && fluxoDoObjeto(alvo);
    if (!fluxo) {
      semToUnicode++;
      continue;
    }
    comToUnicode++;
    for (const [k, v] of interpretarToUnicode(fluxo)) uniao.set(k, v);
  }
  return { mapa: uniao, comToUnicode, semToUnicode };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Interpretador mínimo de content stream
// ─────────────────────────────────────────────────────────────────────────────

const ESCAPES = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };

/** Tokeniza um content stream. Só o suficiente para operadores de texto. */
export function tokenizar(dados) {
  const s = dados.toString("latin1");
  const saida = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];

    if (c === "(") {
      let profundidade = 1;
      let j = i + 1;
      let buf = "";
      while (j < s.length && profundidade > 0) {
        const ch = s[j];
        if (ch === "\\") {
          const prox = s[j + 1];
          if (prox in ESCAPES) {
            buf += ESCAPES[prox];
            j += 2;
            continue;
          }
          const oct = /^[0-7]{1,3}/.exec(s.slice(j + 1, j + 4));
          if (oct) {
            buf += String.fromCharCode(parseInt(oct[0], 8) & 0xff);
            j += 1 + oct[0].length;
            continue;
          }
          buf += prox ?? "";
          j += 2;
          continue;
        }
        if (ch === "(") profundidade++;
        else if (ch === ")") {
          profundidade--;
          if (profundidade === 0) break;
        }
        buf += ch;
        j++;
      }
      saida.push({ t: "str", v: buf });
      i = j + 1;
      continue;
    }

    if (c === "<" && s[i + 1] !== "<") {
      const j = s.indexOf(">", i);
      if (j === -1) break;
      const hex = s.slice(i + 1, j).replace(/\s/g, "");
      let buf = "";
      for (let k = 0; k + 1 < hex.length; k += 2) {
        const b = parseInt(hex.slice(k, k + 2), 16);
        if (!Number.isNaN(b)) buf += String.fromCharCode(b);
      }
      saida.push({ t: "str", v: buf, hex: true });
      i = j + 1;
      continue;
    }

    let m = /^\/[^\s/[\]<>(){}]*/.exec(s.slice(i));
    if (m) {
      saida.push({ t: "nome", v: m[0] });
      i += m[0].length;
      continue;
    }
    m = /^[-+]?[0-9]*\.?[0-9]+/.exec(s.slice(i));
    if (m) {
      saida.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    m = /^[A-Za-z'"*]+/.exec(s.slice(i));
    if (m) {
      saida.push({ t: "op", v: m[0] });
      i += m[0].length;
      continue;
    }
    i++;
  }
  return saida;
}

function decodificar(bruto, mapa) {
  if (mapa.size === 0) return bruto;
  // Códigos acima de 255 no CMap indicam fonte de 2 bytes.
  let largo = false;
  for (const k of mapa.keys()) {
    if (k > 255) {
      largo = true;
      break;
    }
  }
  let saida = "";
  if (largo) {
    for (let i = 0; i + 1 < bruto.length; i += 2) {
      const cod = (bruto.charCodeAt(i) << 8) | bruto.charCodeAt(i + 1);
      saida += mapa.get(cod) ?? "";
    }
  } else {
    for (let i = 0; i < bruto.length; i++) {
      const cod = bruto.charCodeAt(i);
      saida += mapa.get(cod) ?? bruto[i];
    }
  }
  return saida;
}

/**
 * Percorre um content stream e devolve os fragmentos com a posição em que
 * foram desenhados na página.
 *
 * É a posição que permite reconstruir a ordem de leitura (armadilha 2). Sem
 * ela, sobra a ordem de emissão — que no PJe está errada onde mais importa.
 */
export function fragmentosDoFluxo(dados, mapa) {
  const fragmentos = [];
  let tm = [1, 0, 0, 1, 0, 0]; // matriz de texto
  let tlm = [1, 0, 0, 1, 0, 0]; // matriz da linha
  let entrelinha = 0;
  let pilha = [];

  const transladar = (tx, ty) => {
    // Tlm = translate(tx,ty) × Tlm  — só os termos que afetam a origem.
    tlm = [tlm[0], tlm[1], tlm[2], tlm[3], tlm[0] * tx + tlm[2] * ty + tlm[4], tlm[1] * tx + tlm[3] * ty + tlm[5]];
    tm = [...tlm];
  };

  const emitir = () => {
    const texto = pilha.join("");
    pilha = [];
    if (texto === "") return;
    fragmentos.push({ x: tm[4], y: tm[5], texto });
  };

  const toks = tokenizar(dados);
  for (let i = 0; i < toks.length; i++) {
    const tok = toks[i];
    if (tok.t === "str") {
      pilha.push(decodificar(tok.v, mapa));
      continue;
    }
    if (tok.t !== "op") continue;

    switch (tok.v) {
      case "BT":
        tm = [1, 0, 0, 1, 0, 0];
        tlm = [1, 0, 0, 1, 0, 0];
        pilha = [];
        break;
      case "Tm": {
        const n = numerosAnteriores(toks, i, 6);
        if (n) {
          tm = [...n];
          tlm = [...n];
        }
        pilha = [];
        break;
      }
      case "TL": {
        const n = numerosAnteriores(toks, i, 1);
        if (n) entrelinha = n[0];
        break;
      }
      case "Td": {
        const n = numerosAnteriores(toks, i, 2);
        if (n) transladar(n[0], n[1]);
        pilha = [];
        break;
      }
      case "TD": {
        const n = numerosAnteriores(toks, i, 2);
        if (n) {
          entrelinha = -n[1];
          transladar(n[0], n[1]);
        }
        pilha = [];
        break;
      }
      case "T*":
        transladar(0, -entrelinha);
        pilha = [];
        break;
      case "Tj":
      case "TJ":
        emitir();
        break;
      case "'":
        transladar(0, -entrelinha);
        emitir();
        break;
      case '"':
        transladar(0, -entrelinha);
        emitir();
        break;
      case "ET":
        emitir();
        break;
      default:
        // Qualquer outro operador encerra a coleta de strings pendentes: elas
        // eram operandos dele, não texto a desenhar.
        pilha = [];
    }
  }
  emitir();
  return fragmentos;
}

function numerosAnteriores(toks, i, quantos) {
  const n = [];
  for (let j = i - 1; j >= 0 && n.length < quantos; j--) {
    if (toks[j].t !== "num") return null;
    n.unshift(toks[j].v);
  }
  return n.length === quantos ? n : null;
}

/** Tolerância vertical para considerar dois fragmentos na mesma linha (pontos). */
const TOLERANCIA_LINHA = 3;

/** Ordena fragmentos em ordem de leitura: de cima para baixo, da esquerda para a direita. */
export function ordenarPorLeitura(fragmentos) {
  const linhas = [];
  for (const f of [...fragmentos].sort((a, b) => b.y - a.y)) {
    const linha = linhas.find((l) => Math.abs(l.y - f.y) <= TOLERANCIA_LINHA);
    if (linha) linha.itens.push(f);
    else linhas.push({ y: f.y, itens: [f] });
  }
  return linhas.map((l) => l.itens.sort((a, b) => a.x - b.x).map((f) => f.texto).join(""));
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Entrada principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrai o texto de um PDF.
 *
 * @param {Buffer} buffer
 * @param {{ordenarPorPosicao?: boolean}} opcoes
 *   `ordenarPorPosicao: false` reproduz de propósito o comportamento ingênuo
 *   (ordem de emissão) — é assim que o spike MEDE o estrago da armadilha 2.
 */
export function extrairTexto(buffer, { ordenarPorPosicao = true } = {}) {
  const objetos = extrairObjetos(buffer);
  if (objetos.size === 0) throw new PdfTextoError("nenhum objeto PDF reconhecido");

  const { mapa, comToUnicode, semToUnicode } = mapaDeFontes(objetos);

  const partes = [];
  let fluxosDeTexto = 0;
  let operadoresTexto = 0;
  let imagens = 0;

  for (const num of [...objetos.keys()].sort((a, b) => a - b)) {
    const corpo = objetos.get(num);
    if (corpo.toString("latin1").includes("/Image")) imagens++;
    const fluxo = fluxoDoObjeto(corpo);
    if (!fluxo) continue;
    const s = fluxo.toString("latin1");
    if (!s.includes("Tj") && !s.includes("TJ")) continue;

    fluxosDeTexto++;
    operadoresTexto += (s.match(/\bT[Jj]\b/g) ?? []).length;

    const fragmentos = fragmentosDoFluxo(fluxo, mapa);
    partes.push(ordenarPorPosicao ? ordenarPorLeitura(fragmentos).join("\n") : fragmentos.map((f) => f.texto).join(""));
  }

  const texto = partes.join("\n");
  return {
    texto,
    diagnostico: {
      objetos: objetos.size,
      fluxosDeTexto,
      operadoresTexto,
      imagens,
      fontesComToUnicode: comToUnicode,
      fontesSemToUnicode: semToUnicode,
      codigosNoCMap: mapa.size,
      caracteres: texto.length,
    },
  };
}

/** Âncoras estruturais que toda ata do PJe tem. Se sumirem, o texto saiu ilegível. */
const ANCORAS = [/PODER\s+JUDICI[ÁA]RIO/i, /JUSTI[ÇC]A\s+DO\s+TRABALHO/i, /ATA\s+DE\s+AUDI[ÊE]NCIA/i];

/**
 * Detecta se o PDF tem camada de texto USÁVEL.
 *
 * A distinção que importa: "tem operadores de texto" e "o texto sai legível"
 * são coisas diferentes. Um PDF com CMap não aplicado tem operadores de sobra e
 * produz caracteres imprimíveis — só que errados. A v2 §1.2-b previa detectar
 * ausência de camada; não previa camada presente e ilegível.
 */
export function detectarCamadaDeTexto(buffer) {
  const { texto, diagnostico } = extrairTexto(buffer);
  const temOperadores = diagnostico.operadoresTexto > 0;
  const ancoras = ANCORAS.filter((re) => re.test(texto)).length;
  const temCnj = CNJ_REGEX.test(repararNumerosCnj(texto));

  let veredicto;
  if (!temOperadores) veredicto = "sem_camada_de_texto";
  else if (ancoras === 0) veredicto = "camada_ilegivel";
  else if (ancoras < ANCORAS.length) veredicto = "camada_parcial";
  else veredicto = "camada_utilizavel";

  return { veredicto, ancorasEncontradas: ancoras, ancorasTotal: ANCORAS.length, temCnj, texto, diagnostico };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Normalização e verificação de citação — armadilha 3
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une palavras partidas por quebra de linha após hífen.
 *
 * Verificado nas 10 atas: TODAS as 16 quebras com hífen no fim da linha ocorrem
 * em hífen REAL da palavra ou do identificador ("realizou-se", "intime-se",
 * "0900001-07.2026...", "https://domicilio-eletronico..."). O PJe não hifeniza
 * para justificar. Por isso a regra correta aqui é PRESERVAR o hífen e remover
 * só a quebra — o oposto do que se faria num texto tipograficamente hifenizado.
 */
export function unirQuebrasDeHifen(texto) {
  return texto.replace(/-[ \t]*\r?\n[ \t]*/g, "-");
}

/** Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO */
export const CNJ_REGEX = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
const CNJ_GLOBAL = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g;

/**
 * Repara números de processo partidos por quebra de linha.
 *
 * Caso observado numa das atas (número trocado por fictício): "Ação Trabalhista - Rito Ordinário número 0900001-\n
 * 07.2026.5.12.0901". A chave que identifica o processo — a que liga o fato ao
 * registro no banco — é a que quebra.
 */
export function repararNumerosCnj(texto) {
  return texto.replace(/(\d{7}-)[ \t]*\r?\n[ \t]*(\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/g, "$1$2");
}

export function extrairNumerosCnj(texto) {
  return [...new Set(repararNumerosCnj(texto).match(CNJ_GLOBAL) ?? [])];
}

/**
 * Converte um valor monetário brasileiro em CENTAVOS (inteiro).
 *
 * Centavos porque o schema guarda `valor_centavos INTEGER`: dinheiro em ponto
 * flutuante acumula erro, e aqui o número vira obrigação de pagamento de
 * cliente.
 *
 * Formatos vistos no MESMO conjunto de atas (valores fictícios): "R$12.000,00" (sem espaço)
 * e "R$ 17.430,00" (com espaço).
 */
export function valorParaCentavos(entrada) {
  const s = String(entrada).replace(/R\$\s*/i, "").trim();
  const m = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(s);
  if (!m) throw new PdfTextoError(`valor monetário não reconhecido: "${entrada}"`, { entrada });
  const inteiros = m[1].replace(/\./g, "");
  const centavos = (m[2] ?? "").padEnd(2, "0");
  return Number(inteiros) * 100 + Number(centavos);
}

const VALOR_GLOBAL = /R\$\s*\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g;

export function extrairValores(texto) {
  return (texto.match(VALOR_GLOBAL) ?? []).map((bruto) => ({ bruto, centavos: valorParaCentavos(bruto) }));
}

/** Colapsa espaços e normaliza Unicode. Preserva os caracteres. */
function normalizarEspacos(s) {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Só letras e dígitos, minúsculas. Última linha de defesa contra formatação. */
function apenasAlfanumerico(s) {
  return s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Níveis de verificação, do mais estrito ao mais tolerante.
 *
 * A ordem importa: quanto mais alto o nível necessário, mais o texto extraído
 * divergiu do que o modelo citou — e o relatório precisa desse número para
 * dizer se o mecanismo da v2 §1.2-b se sustenta na prática.
 */
export const NIVEIS = ["literal", "espacos", "hifen", "alfanumerico"];

/**
 * Verifica se `trecho` existe literalmente em `documento`.
 *
 * É o mecanismo anti-alucinação da v2 §1.2-b. Devolve o NÍVEL de normalização
 * que foi preciso aplicar — nunca só um booleano — porque "confere depois de
 * apagar toda a pontuação" é uma garantia mais fraca que "confere literalmente",
 * e quem chama precisa poder decidir com base nisso.
 */
export function verificarCitacao(trecho, documento, { nivelMaximo = "alfanumerico" } = {}) {
  if (typeof trecho !== "string" || trecho.trim() === "") {
    throw new PdfTextoError("trecho vazio não pode ser verificado", { trecho });
  }
  const limite = NIVEIS.indexOf(nivelMaximo);
  if (limite === -1) throw new PdfTextoError(`nível desconhecido: ${nivelMaximo}`);

  const candidatos = [
    ["literal", (s) => s, documento],
    ["espacos", normalizarEspacos, documento],
    ["hifen", (s) => normalizarEspacos(unirQuebrasDeHifen(s)), repararNumerosCnj(documento)],
    ["alfanumerico", apenasAlfanumerico, repararNumerosCnj(unirQuebrasDeHifen(documento))],
  ];

  for (let i = 0; i <= limite; i++) {
    const [nivel, fn, doc] = candidatos[i];
    if (fn(doc).includes(fn(trecho))) return { verificado: true, nivel };
  }
  return { verificado: false, nivel: null };
}

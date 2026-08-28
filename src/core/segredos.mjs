/**
 * Cofre de segredos — macOS Keychain.
 *
 * Guarda refresh token do Google e a chave da API da Anthropic. Nada de `.env`,
 * nada em texto claro no disco do projeto.
 *
 * Decisões e limitações, explícitas:
 *
 *  • Usa o binário `security` do próprio macOS via execFileSync com ARGUMENTOS
 *    (nunca shell). Isso elimina injeção de shell e histórico de comandos.
 *
 *  • ⚠️ LIMITAÇÃO CONHECIDA: `security add-generic-password` recebe o segredo
 *    como argumento, e argumentos de processo são visíveis em `ps` durante a
 *    execução. A janela é de milissegundos e a máquina é de usuária única, mas
 *    a limitação é real. Por isso a GRAVAÇÃO é rara (setup/rotação) e a
 *    LEITURA — que é o caminho quente — não expõe nada.
 *
 *  • Segredo nunca é logado, nem em erro. As mensagens de erro citam a conta,
 *    jamais o valor.
 */

import { execFileSync } from "node:child_process";

const SERVICO = "assistente-juridico";

function chamarSecurity(args, { permitirFalha = false } = {}) {
  try {
    return execFileSync("/usr/bin/security", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (erro) {
    if (permitirFalha) return null;
    // A mensagem do `security` não contém o segredo; ainda assim, truncamos.
    const detalhe = String(erro.stderr ?? erro.message).trim().slice(0, 200);
    throw new Error(`Keychain falhou (${args[0]}): ${detalhe}`);
  }
}

/** Grava ou substitui um segredo. Rara — setup e rotação. */
export function guardar(conta, valor, { servico = SERVICO } = {}) {
  if (!conta) throw new Error("guardar exige nome da conta");
  if (typeof valor !== "string" || valor.length === 0) {
    throw new Error(`valor inválido para "${conta}" (esperado string não vazia)`);
  }
  chamarSecurity([
    "add-generic-password",
    "-a", conta,
    "-s", servico,
    "-w", valor,
    "-U",               // atualiza se já existir
    "-T", "",           // nenhum app pré-autorizado a ler sem consentimento
  ]);
  return true;
}

/** Lê um segredo. Retorna null se não existir — não lança. */
export function ler(conta, { servico = SERVICO } = {}) {
  const saida = chamarSecurity(
    ["find-generic-password", "-a", conta, "-s", servico, "-w"],
    { permitirFalha: true },
  );
  return saida === null ? null : saida.replace(/\n$/, "");
}

/** Lê um segredo obrigatório. Lança mensagem acionável se faltar. */
export function lerObrigatorio(conta, opcoes) {
  const v = ler(conta, opcoes);
  if (v === null) {
    throw new Error(
      `segredo "${conta}" não está no Keychain. ` +
        `Grave com: node -e 'import("./src/core/segredos.mjs").then(s=>s.guardar("${conta}","<valor>"))'`,
    );
  }
  return v;
}

export function remover(conta, { servico = SERVICO } = {}) {
  const r = chamarSecurity(
    ["delete-generic-password", "-a", conta, "-s", servico],
    { permitirFalha: true },
  );
  return r !== null;
}

export function existe(conta, opcoes) {
  return ler(conta, opcoes) !== null;
}

/** Contas esperadas. Serve de checklist no diagnóstico. */
export const CONTAS = {
  ANTHROPIC: "anthropic_api_key",
  GOOGLE_REFRESH: "google_refresh_token",
  GOOGLE_CLIENT_ID: "google_client_id",
  GOOGLE_CLIENT_SECRET: "google_client_secret",
};

/** Diagnóstico: quais segredos existem. NUNCA devolve valores. */
export function diagnostico(opcoes) {
  return Object.fromEntries(
    Object.entries(CONTAS).map(([nome, conta]) => [nome, existe(conta, opcoes)]),
  );
}

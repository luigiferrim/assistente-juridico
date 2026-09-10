# Segurança e sigilo

Este repositório é o código de um sistema que lê processo judicial. O que mais
importa proteger aqui não é o código — é **o dado que o código não pode conter**.

## O que conta como incidente

- Qualquer dado real no repositório, na árvore ou no histórico: nome de parte ou
  de cliente, número de processo verdadeiro, e-mail de pessoa real, inscrição de
  OAB real, token, URL de implantação do Apps Script.
- Uma forma de fazer o sistema executar ação externa (evento, e-mail) **sem** o
  clique de aprovação, ou de repetir uma ação já executada.
- Uma forma de fazer o log técnico ou a auditoria carregar teor de comunicação.

## Como relatar

**Não abra issue pública com o dado.** Uma issue pública seria o segundo
vazamento.

1. Se o repositório tiver o relato privado de vulnerabilidades habilitado, use
   **Security → Report a vulnerability** no GitHub.
2. Senão, contate o autor pelo perfil [@luigiferrim](https://github.com/luigiferrim)
   descrevendo **onde** está o problema (arquivo, linha, commit), sem reproduzir o
   dado.

Compromisso: resposta em até 72 horas; dado real encontrado é removido da árvore
**e do histórico** antes de qualquer outra coisa.

## O que já protege

- Auditoria de vazamento na CI, sobre a árvore e todos os commits
  ([ferramentas/auditoria-vazamento.mjs](ferramentas/auditoria-vazamento.mjs)),
  com relatório redigido.
- Guarda de hermetismo na suíte, `.gitignore` com as pastas sob sigilo e lint
  que barra segredo em variável de ambiente ou `.env`.
- Segredos só no Keychain do macOS; nenhuma dependência npm (ADR 0001).

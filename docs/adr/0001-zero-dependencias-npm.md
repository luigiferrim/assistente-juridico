# ADR 0001 — Zero dependências npm

**Status:** aceita · **Data:** agosto de 2026 (Fase 1, fundação)

## Contexto

O banco deste sistema guarda dado sob sigilo profissional: comunicações
processuais, nomes de cliente, atas. Cada pacote npm é superfície de cadeia de
suprimentos que alguém precisa auditar, atualizar e confiar — e o projeto é
mantido por uma pessoa. Ao mesmo tempo, o Node 22 passou a trazer nativo o que
um projeto deste tamanho precisa: `node:sqlite`, `node:test` (com cobertura),
`fetch`, `node:crypto`. O escopo é pequeno: ~17 tabelas, SQL estável, uma
máquina, poucas dezenas de requisições por dia.

## Decisão

Nenhuma dependência npm. Nem de runtime, nem de desenvolvimento: o lint, a
cobertura, a auditoria de vazamento e o conferidor do README são scripts em
Node puro (`ferramentas/`). O `package-lock.json` existe e fica vazio; a CI roda
`npm ci` justamente para falhar se alguém o alterar.

## Consequências

- **Ganha:** sem `npm install`, sem `npm audit`, sem bot de atualização de
  pacote, sem transitivas. A árvore inteira é auditável por leitura. O
  argumento de segurança do projeto (dado sob sigilo nunca sai do Mac) fica
  coerente: não há código de terceiro rodando sobre ele.
- **Paga:** sem ORM (SQL à mão, migrações em arquivo); sem ESLint — o lint
  nativo confere sintaxe e regras do projeto, mas não faz análise semântica
  (variável não usada, escopo); HTTP só com `fetch`; Keychain via o binário
  `security` do macOS.
- **Limite conhecido:** a extração de texto de PDF (Fase 3) provavelmente
  exigirá biblioteca madura — o extrator do spike S5 é descartável e prova isso.
  Quando chegar, esta decisão deve ser revista por ADR, não contornada.

## Onde se vê

`package.json` (`dependencies` e `devDependencies` vazios), `package-lock.json`,
passo "Conferir lockfile" em `.github/workflows/ci.yml`, badge "dependências npm:
0" conferido por `ferramentas/verificar-readme.mjs`.

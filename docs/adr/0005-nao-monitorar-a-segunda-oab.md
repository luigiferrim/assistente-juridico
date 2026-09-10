# ADR 0005 — Não monitorar a segunda OAB por descoberta

**Status:** aceita · **Data:** agosto de 2026 (registro de comunicações, S3)

## Contexto

A consulta ao DJEN é por inscrição na OAB. Ao registrar as comunicações reais
para medir a cobertura (S3), apareceram atas em que a advogada da mesma cliente
era outra inscrição — a sócia do escritório, que atua junto em parte dos
processos. Tecnicamente, incluir a segunda OAB na coleta é uma linha de
configuração. Juridicamente e eticamente, é passar a monitorar as comunicações
de **outra pessoa**.

## Decisão

Descobrir uma OAB nos dados **não é autorização para vigiá-la**. O sistema
consulta apenas as inscrições explicitamente configuradas, com consentimento de
quem as detém; a inclusão de qualquer OAB é decisão das advogadas, nunca do
desenvolvedor, e entra pelo `dados/config.json` (fora do git) — não por código.
O S3 mede a cobertura **separada por inscrição** justamente para que essa decisão
possa ser tomada com número na mão, e não por impressão.

## Consequências

- O briefing declara o limite: "a consulta por uma OAB não vê o que é dirigido à
  sócia" — "nada chegou" nunca aparece sem o carimbo do que foi consultado.
- A lista de OABs monitoradas é configuração, não constante: o código versionado
  conhece só o escritório fictício (OABs 10001–10003).
- A medição de cobertura tem uma coluna `oab_destinataria`, com "vazio" como
  resposta legítima — chutar estragaria a medição que a coluna existe para fazer.

## Onde se vê

`ADVOGADOS` e `lerConfig()` em `src/core/escritorio.mjs`, `OABS_DO_ESCRITORIO` em
`src/adapters/djen.mjs`, tabela `comunicacoes_oab` (migração 002), seção
"Limites conhecidos" do README.

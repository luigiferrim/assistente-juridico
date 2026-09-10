# ADR 0002 — Descarte do DataJud como fonte de monitoramento

**Status:** aceita · **Data:** agosto de 2026 (Fase 0, spike S6)

## Contexto

Havia duas APIs públicas do CNJ candidatas a fonte do "o que chegou hoje": o
**DJEN / Comunica CNJ** (comunicações do Diário) e o **DataJud** (metadados de
movimentação processual). O DataJud é tentador: cobre movimentos, não só
publicações. O spike S6 mediu, em requisições só de leitura sobre processos
reais do escritório, quanto tempo um movimento leva para aparecer lá em
comparação com o Diário.

## Decisão

O DataJud **não serve para monitorar**: o atraso mediano medido foi de **42
dias**. Um assistente que avisa "chegou uma intimação" seis semanas depois é
pior do que nenhum, porque cria a sensação de cobertura. O DJEN é a fonte
primária de detecção; o DataJud fica, no máximo, como candidato a *backfill*
histórico (o DJEN começa em ~2025).

## Consequências

- O pipeline tem **uma** fonte automática, com limites medidos e codificados
  (spike S2): ~20 req/min, recuperação do 429 em ~51 s, página mínima de 5,
  `count` não confiável, HTTP 500 enganoso no fim da lista — por isso "erro
  nunca encerra paginação".
- O DJEN **não vê tudo**: a primeira citação das empresas chega pelo Domicílio
  Judicial Eletrônico e é repassada por e-mail; a consulta é por OAB. Logo o
  briefing declara sempre a cobertura ("nada apareceu *no que eu vejo*") em vez
  de afirmar "não há nada".
- O DJEN bloqueia IP de datacenter (403 de borda, medido em GitHub Actions e
  proxy de nuvem). A coleta roda local, no Mac do escritório.

## Onde se vê

`spikes/README.md` (tabela de spikes, S6 e limites do DJEN),
`spikes/s6_datajud.py`, `src/adapters/djen.mjs` (regra de terminação e limites),
`COBERTURA_NAO_VE` em `src/core/escritorio.mjs`.

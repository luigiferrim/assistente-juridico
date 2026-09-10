# ADR 0003 — Publicação = disponibilização + 1 dia útil

**Status:** aceita · **Data:** agosto de 2026 (spike S8 e conferência contra o PJe)

## Contexto

A API do DJEN devolve `data_disponibilizacao`. Prazo processual conta da
**publicação**, e a Lei 11.419/2006 (art. 4º, § 3º) define publicação como o
primeiro dia útil seguinte à disponibilização no Diário eletrônico; o prazo
começa no dia útil seguinte à publicação (§ 4º). Era preciso saber se a tela do
PJe — o gabarito que as advogadas usam — segue exatamente isso, inclusive nos
feriados regimentais de cada tribunal.

## Decisão

A data de publicação **nunca** é o campo cru da API: é `data_disponibilizacao`
avançada ao próximo dia útil **pelo calendário do tribunal da comunicação**. A
regra foi conferida contra a tela do PJe em **4 pares independentes**
(API × "Data de Ciência"), todos +1 dia útil. Os calendários dos 6 tribunais do
escopo (TRT12, TRT3, TRT6, TRT9, TRT15, TST) foram semeados de portarias e atos
oficiais, entrada a entrada — e toda entrada nasce `confirmado_em NULL` até
validação humana.

## Consequências

- Todo cálculo que dependa de feriado não confirmado sai com `requerConfirmacao`
  e a memória de cálculo (qual regra, qual feriado, qual fonte legal).
- Manter calendário vira trabalho recorrente e por tribunal; um feriado
  transferido por portaria (aconteceu em 2026) muda a data de publicação.
- O briefing mostra a data estimada de publicação, não a de disponibilização,
  e o motor de prazos (fechado, ADR 0004) parte dela.

## Onde se vê

`src/core/prazos/REGRA-DO-ESCRITORIO.md` (os 4 pares e a cadeia completa),
`publicacaoEstimada()` em `src/core/briefing/triagem.mjs`,
`src/core/prazos/calendario.mjs`, scripts de carga em `src/scripts/`.

# ADR 0004 — Motor de prazos deliberadamente não aprovado

**Status:** aceita · **Data:** 9 de agosto de 2026 (spike S8 parcial), reafirmada na Fase 2

## Contexto

O motor de prazos (`src/core/prazos/`) reproduz a conta do tribunal nos casos
conferidos: calendário por tribunal, contagem em dias úteis, memória de cálculo
com a fonte legal de cada passo. Mas a conta que importa é a **da advogada**, e
o gabarito que a validaria — dez casos calculados à mão por ela — não foi
produzido. A prioridade do produto, revista com as usuárias, é outra: "quem
mandou, para quê, o que é mais urgente". Prazo, elas conferem no sistema do
tribunal, sempre.

## Decisão

`APROVADO_PELA_ADVOGADA = false`, e pode ficar assim indefinidamente. Enquanto
for `false`, todo resultado do motor sai `provisorio`, com `requerConfirmacao`,
e o briefing imprime CONFIRMAR. As datas do fluxo principal são **lidas** (da
publicação, da ata), não calculadas: o motor é uma segunda dupla de olhos
permanente, não a fonte. Agenda recebe **só audiências**; prazos vivem no
briefing e ressurgem ao se aproximar.

## Consequências

- Nenhuma data calculada vira evento ou compromisso sem conferência humana.
- A chave só vira com o gabarito em mãos — e o lint (`portao-de-prazos`) falha
  se alguém a ligar sem remover a regra no mesmo commit: ligar exige duas
  mudanças deliberadas, não um toggle.
- O trabalho de calendário (ADR 0003) continua valendo mesmo com o motor
  fechado, porque a data de publicação estimada depende dele.

## Onde se vê

`src/core/prazos/index.mjs` (`APROVADO_PELA_ADVOGADA`, `requerConfirmacao`,
`provisorio`), `src/core/prazos/REGRA-DO-ESCRITORIO.md` ("Fechado"), regra
`portao-de-prazos` em `ferramentas/lint.mjs`, seção "Limites conhecidos" do README.

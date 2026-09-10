# ADR 0006 — Aprovação humana para toda ação externa

**Status:** aceita · **Data:** agosto de 2026 (Parte 5 do plano, antes da primeira linha de código)

## Contexto

O sistema age sobre a agenda de advogadas e a caixa de entrada de clientes.
Um evento errado é uma audiência perdida; um e-mail errado é informação de um
processo indo para o cliente errado — responsabilidade civil, não bug. A
tentação de "automatizar tudo" é grande num assistente matinal; a
consequência de um erro silencioso é desproporcional ao ganho.

## Decisão

O sistema **propõe**; a advogada **aprova**. Nenhum evento é criado ou alterado,
nenhum e-mail é enviado, sem um gesto humano explícito sobre aquela ação
específica. O aviso ao cliente nasce **sempre** como rascunho — mesmo depois de
aprovada a audiência, enviá-lo é um segundo gesto. Não existe modo automático.

## Consequências

- A superfície de aprovação virou o **botão no próprio e-mail** (Apps Script):
  um clique cria o evento, com trava anti-duplicata, e deixa o rascunho do aviso.
  O painel web previsto na especificação deixou de fazer sentido e não foi
  construído — registrado em `PRODUTO.md` em vez de apagado.
- Idempotência é responsabilidade nossa: a chave é reservada **antes** da
  chamada externa, para que um clique repetido ou um processo que morre no meio
  nunca gere duas ações. Toda ação fica na trilha de auditoria append-only.
- Custo: latência e dependência de alguém clicar. O vigia-do-vigia (alarme das
  8h) existe porque "ninguém viu" é um modo de falha real deste desenho.
- Não há código em `src/` que chame Google Calendar ou Gmail: a única porta para
  o mundo é o botão, e o lint garante que não entre chamada de modelo no caminho.

## Onde se vê

`deploy/apps-script-escritorio.md` (doGet de aprovação, trava, rascunho),
`src/core/idempotencia.mjs`, `src/core/auditoria.mjs`, seção "Regras que não
mudam nunca" em `PRODUTO.md`, `ARCHITECTURE.md` (o portão no diagrama).

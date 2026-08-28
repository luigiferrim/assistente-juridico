# O produto — Assistente Administrativo Jurídico

**Definido pelo Luigi em 09/08/2026 (D14, revisada):**

> *"Exatamente como o nome dele é: um assistente que toda manhã traz as
> novidades para a advogada — quem mandou mensagem, para quê, quais são as mais
> urgentes, quais não. E os dados das atas: avisar os clientes, ler as datas das
> audiências e colocar na Google Agenda."*

Uma frase: **toda manhã, um briefing triado do que chegou; para cada item, uma
ação proposta; nada executa sem aprovação.**

---

## A manhã típica (como as advogadas usam)

**8h00.** A Advogada 1 abre o briefing — uma tela (ou e-mail interno) que diz:

```
☕ Bom dia. Coleta de hoje: ok às 07h32 (DJEN, OAB 10001 + 10002).

🔴 AGIR HOJE (2)
1. INTIMAÇÃO — 0000002-22.2026.5.12.0002 (ALFA) · TRT12 · para: Advogada 1
   Prazo de 5 dias · vencimento sugerido 17/08 (CONFIRMAR)
   "…concedo o prazo de 5 dias para…"        [ver teor completo]

2. PARCELA DO ACORDO — 0000004-44.2026.5.12.0004 · 3ª/6 · R$ 2.400,00
   vence AMANHÃ (fonte: ata de 26/05, trecho destacado)
   💬 quer avisar o cliente? "avisa a [empresa] sobre a parcela de amanhã…"

📅 AUDIÊNCIAS NOVAS (1)
3. Designada: 28/08 14h15 — 0000012-13 · Zoom (link na ata)
   → Proposta: evento na Google Agenda        [Aprovar] [Editar] [Rejeitar]

🟡 ESTA SEMANA (2)
4. 1ª parcela do acordo 0900005-72 · R$ 17.430,00 · vence 17/08 (em 8 dias)
5. Acórdão publicado — 0900006-38 (TRT9) · para: Advogada 2 · sem prazo detectado

⚪ INFORMATIVO (5) — despachos de expediente, sem ação    [expandir]

⏳ PRÓXIMOS VENCIMENTOS (14 dias) — parcelas e obrigações já conhecidas das atas

──────────────────────────────────────────────────────────
O QUE ESTE SISTEMA NÃO VÊ: citações no Domicílio Eletrônico das empresas
(até o repasse por e-mail) · comunicações a outros advogados · segredo de
justiça. Última coleta completa: hoje 07h32. Os prazos são sugestões —
a conferência no PJe continua sendo sua.
```

Ela lê em cinco minutos. Depois trabalha como sempre — o sistema é a segunda
dupla de olhos, não o titular da responsabilidade. A Advogada 2 usa o mesmo
briefing: cada item diz **para qual OAB veio**.

## Onde cada coisa aparece (definido pelo Luigi, 09/08/2026)

| Informação | Onde vive |
|---|---|
| **Audiência designada** | Briefing **+ Google Agenda** (após Aprovar) |
| **Perícia com data e hora marcada** | Briefing **+ Google Agenda** (após Aprovar) — decidido em 10/08. Em segredo de justiça, o título do evento não leva nome de parte |
| **Prazos e vencimentos das atas** (parcelas, custas, obrigações) | **Só no briefing** — reaparecem conforme se aproximam: entram a ~14 dias, sobem para 🔴 perto de vencer |
| **Aviso ao cliente** | **Sob demanda** — ela pede, o assistente redige e envia (fluxo abaixo) |

## Um briefing por advogado (decidido em 10/08)

O escritório tem três advogados, com práticas distintas — **cada um recebe o seu
briefing**:

| Advogado | OAB | Justiças | Fontes do briefing | **Cor na agenda** |
|---|---|---|---|---|
| Advogada 1 | 10001/SC | TRTs, TST (PJe) | DJEN + e-mail | 🟡 **Banana** |
| Advogada 2 | 10002/SC | TRTs (PJe), com a Advogada 1 | DJEN + e-mail | 🟣 **Uva** |
| Advogado 3 | 10003/SC *(confirmado no DJEN)* | **TJSC, JFSC, TRF4, STJ — via eproc** | DJEN + e-mail (push do eproc, Publicações Online) | 🟢 **Manjericão** |

Todo evento criado na Google Agenda leva a cor do advogado responsável
(definido pelo Luigi em 09/08). Disciplina operacional: **todo briefing começa
conferindo a data real** (`date`) — nunca a data presumida da conversa.

**Regras de design do e-mail** (lições do teste de 09/08 no Gmail real):
1. **Modo escuro:** nunca texto claro sobre fundo colorido — o Gmail
   adapta/remove fundos e o texto some. Só texto escuro sobre fundo claro;
   seções por borda lateral colorida; botões com fundo claro + borda escura.
2. **Celular primeiro:** nada de tabelas largas — o briefing é lido no telefone.
   Cada item é um cartão empilhado (bloco vertical), largura fluida.

## Regras operacionais aprendidas no piloto (10/08, feedback das advogadas)

1. **Conferir a agenda ANTES de propor.** Toda proposta de evento passa primeiro
   por uma busca na Google Agenda; o que já existe não vira proposta — vira nota
   "✔️ já está na agenda (criado por vocês em DD/MM)". *Validado no primeiro
   teste: 4 das 5 propostas já estavam lá.* (É o "dedupe contra o estado atual"
   da Fase 4 do plano, agora com prova de necessidade.)
2. **Toda proposta diz onde foi encontrada.** "Fonte: intimação no DJEN de
   DD/MM" / "e-mail de fulano em DD/MM" — no briefing e na descrição do evento
   criado.
3. **Partes sempre junto do número.** Item de briefing nunca é só
   "0900005-72" — é "0900005-72 · Alfa × Fulano".
4. **Roteamento por remetente:** e-mails do perito **Perito Técnico A**
   (portal-pericias-exemplo.com.br) vão para o briefing da **Advogada 1**, mesmo quando
   endereçados a outro nome. (Lista de exceções de roteamento; começa com esta.)
5. **Padrão de nome de evento** (aprendido da agenda real): `Audiência [cliente]
   x [parte] [vara] [tipo]` · cor do advogado · lembretes popup 10 e 30 min ·
   1h de duração · link da sala no campo local.
6. **Convidados: propostos no briefing, EDITÁVEIS na aprovação.** Ela sempre
   convida os contatos do cliente — cada proposta lista os **e-mails sugeridos**
   (aprendidos dos eventos anteriores do mesmo cliente; a lista real vive em
   `dados/config.json`, fora do git). A resposta de
   aprovação **vem pré-preenchida com a lista, um e-mail por linha** — ela apaga
   a linha de quem não quer antes de enviar. Nunca "aprovar e desconvidar
   depois": o convite só sai para quem sobrou na resposta.
9. **Toda comunicação de processo com o cliente vive na conversa do processo.**
   Convenção do escritório (analisada no Gmail real): uma conversa por processo,
   assunto `PROCESSO [NOVO] {NOME DA PARTE}`, e cada novidade — audiência
   designada, perícia, laudo, documento — vai como **resposta nessa conversa**,
   preservando o histórico do caso num lugar só. O assistente localiza a
   conversa e responde nela; se não existir, cria com o assunto no padrão.
10. **A descrição do evento é lida pelos CONVIDADOS.** Nada interno nela: sem
    "cor X = advogada Y", sem "criado pelo assistente mediante aprovação", sem
    notas de estratégia ou de prazos internos. Só o que o convidado precisa:
    tipo, processo, partes, vara, link — e a fonte em redação neutra ("Fonte:
    intimação publicada no Diário em DD/MM"). *(Regra de 10/08 — a primeira
    versão do evento tinha meta interna e o convidado leria.)*
11. **Links em e-mail: sempre âncora HTML** (`<a href>texto</a>`), nunca URL
    crua no texto — o Gmail embrulha URL crua num redirecionador
    (`google.com/url?q=…`) feio, embora inofensivo.
12. **O briefing pode ser ENVIADO direto** (autorização de 10/08): é relatório
    interno à própria caixa. **Diagnóstico do 1º disparo da rotina (10/08):**
    conector Gmail confirmado **sem ferramenta de envio** (só rascunho) e o
    ambiente da nuvem **bloqueia o domínio do DJEN** por política de rede (a
    rotina declarou a falta de cobertura corretamente). Solução em camadas:
    **(a)** Apps Script na conta do escritório envia às ~7h20 o rascunho cujo
    assunto seja `☕ Briefing — DD/MM/AAAA` — ver
    [deploy/apps-script-envia-briefing.md](deploy/apps-script-envia-briefing.md);
    por isso **nenhum outro rascunho pode usar esse padrão de assunto**;
    **(b)** rotina tenta o DJEN via WebFetch (teste em 11/08); **(c)** o
    definitivo é o sistema local (Fase 2), que tem DJEN comprovado e credencial
    própria de envio. **Aviso a cliente continua rascunho sempre — isso não
    muda.**
13. **Pós-aprovação de audiência: rascunho de aviso ao cliente na conversa do
    processo.** Além do convite de agenda, o assistente gera o e-mail de aviso
    no modelo dela (*"Informo que foi designada audiência de [tipo] no processo
    movido por [PARTE], para o dia DD/MM/AAAA, às HHhMM. Favor agendar.
    Preposta e testemunhas devem participar. Vir ao meu escritório ou acessar o
    link abaixo."*), como **resposta na conversa do processo**, endereçado aos
    contatos habituais dela — **sempre RASCUNHO**, com marcador `[EDITAR: …]`
    para as orientações do caso. Ela completa e envia.
7. **"📍 Onde encontrei" clicável em toda proposta.** Cada item traz um link
   para a origem: a comunicação no DJEN (o campo `link` da API leva à validação
   no PJe) ou o e-mail correspondente (permalink do Gmail). Um toque e ela vê a
   fonte inteira.
8. **Cadência: o briefing roda de manhã cedo, no próprio dia** (~7h, dias
   úteis), cobrindo o acumulado desde a coleta anterior — fim de semana entra no
   de segunda. O envio de domingo à noite foi exceção de teste.

Particularidades do Advogado 3: no **eproc** a intimação eletrônica acontece
dentro do sistema, com ciência própria — nem tudo passa pelo Diário. E os prazos
dele seguem **CPC, não CLT**: o motor de prazos não calcula nada para
TJSC/JFSC/TRF4 (sem calendário e sem regra validada — recusa por desenho).

**Publicações Online** (serviço que o escritório já assina) entra como **fonte
secundária**: os alertas chegam por e-mail e o briefing os cruza com o DJEN; o
informativo diário negativo dele serve de contraprova de cobertura.

Consequência técnica: as obrigações extraídas das atas ficam guardadas no banco
e **ressurgem sozinhas** no briefing na hora certa — extrai uma vez, lembra até
vencer.

## O aviso ao cliente — por comando, não por proposta

> Ela: *"avisa a ALFA que a 3ª parcela vence amanhã — R$ 2.400, e menciona
> que o boleto foi enviado pela advogada do reclamante."*
>
> Assistente: mostra o e-mail pronto — destinatário (do cadastro), assunto,
> corpo com os dados do processo e o trecho da ata como base.
>
> Ela: *"manda."* → enviado, e registrado na auditoria (quem pediu, quando, o
> que foi).

Três travas permanentes nesse fluxo:

1. **Destinatário só de cadastro validado** — o e-mail do cliente nunca é
   inferido de documento ou de conversa; vem de uma lista conferida pelas
   advogadas.
2. **O e-mail aparece na tela antes de ir**, e o "manda" dela é a aprovação.
   Iniciativa humana + confirmação humana; o sistema nunca decide avisar
   sozinho.
3. **Auditoria de tudo** — pedido, texto final, destinatário, hora.

---

## O que o briefing responde, por item

| Pergunta | De onde vem |
|---|---|
| **Quem mandou?** | Tribunal/órgão (DJEN) · empresa cliente (e-mail) · perito etc. |
| **Para quê?** | Tipo + resumo de 1 linha, com o **trecho literal** como fonte |
| **Para quem?** | OAB 10001 · 10002 · ambas |
| **É urgente?** | 🔴 hoje · 🟡 semana · ⚪ informativo (regras abaixo) |
| **Que prazo dispara?** | Data lida do documento, ou calculada **com CONFIRMAR** |
| **O que fazer?** | Audiência → propor agenda · prazo → fica visível no briefing · aviso → ela pede |

**Triagem — o que puxa para cima:** prazo curto ou vencendo · citação repassada
(risco de revelia) · audiência próxima · parcela de acordo vencendo (cláusula
penal de 30%) · primeiro movimento de processo novo. **O que empurra para
baixo:** despacho de expediente, comunicação repetida, ciência sem prazo.
Ambíguo nunca é escondido: vira "não sei classificar — olhar".

## Regras que não mudam nunca (Parte 5 do plano)

- Nenhum e-mail enviado, evento criado ou alterado **sem aprovação explícita**.
- Nenhum login no PJe, nenhum uso de certificado, nenhuma ciência de expediente.
- O briefing **sempre** declara o que não vê e quando coletou pela última vez.
  "Nada chegou" nunca aparece — o que aparece é "nada chegou *no que eu vejo*".
- Prazo calculado sai com memória de cálculo e CONFIRMAR; a conferência no PJe
  é delas.
- Processo em segredo de justiça: sem nome de parte em título de evento, sem
  teor em e-mail.

---

## Como chega até elas (sem Claude Code)

As advogadas **não instalam nada** e nunca veem Claude Code — isso é ferramenta
do Luigi (desenvolvimento e piloto). Para elas, duas superfícies:

1. **E-mail interno, toda manhã.** O briefing chega na caixa do escritório —
   dá para ler no celular, no café. Só leitura.
2. **O painel** — tecnicamente "um site", mas que roda **no Mac do escritório**
   (um favorito no navegador, ex.: `http://localhost:3000`). É onde ficam os
   botões Aprovar/Editar/Rejeitar das audiências e a caixa de comando: *"avisa a
   ALFA que…"*. Por trás dessa caixa o sistema chama a IA; elas só digitam.

**Por que um site local e não um site na internet:** os dados são sigilo
profissional. No desenho atual, comunicação, ata e nome de cliente **nunca saem
do computador do escritório** — não há servidor na nuvem guardando processo de
cliente, não há login exposto na internet para ser atacado, não há terceiro no
meio. O mesmo Mac que coleta (worker via launchd) serve o painel. Limitação
honesta: o painel só abre no escritório (ou na rede dele); fora dele, o que
viaja é o e-mail da manhã.

**No piloto (agora):** o briefing chega por e-mail, montado por mim com os
conectores da conta — e as ações (agenda, avisos) passam pelo Luigi nesta
sessão. A experiência delas já é a final: ler o briefing de manhã; só a cozinha
é diferente.

## Os dois modos de entrega

### Modo piloto — já possível, com o Claude nesta máquina

Enquanto o sistema local amadurece, o fluxo inteiro roda comigo, com o Luigi no
circuito: consulto o DJEN público (as duas OABs), leio as atas da pasta, monto o
briefing triado, e — com aprovação — crio os eventos na Google Agenda e os
rascunhos no Gmail pelos conectores já ligados desta conta. Serve também para
**calibrar a triagem com feedback real** delas antes de virar código: cada "isso
não era urgente" do piloto vira regra do sistema.

### Modo final — o sistema local (as fases do plano, reordenadas pela D14)

Worker via launchd toda manhã → coleta DJEN (duas OABs, paginação segura já
testada) → extração de atas (pdfjs-dist, D11) → triagem → briefing → tela de
aprovação → executores de agenda e e-mail com idempotência própria e auditoria
append-only. O e-mail (leitura dos repasses das empresas — por onde chegam as
**citações**) sobe de prioridade em relação ao plano original.

## Arquitetura: agentes especialistas, organizador determinístico

Pergunta do Luigi (09/08/2026): *"será com agentes? cada agente cuida de uma
parte? … e até um agente organizador?"*

**Resposta: especialistas sim, organizador não.** O sistema tem vários "agentes"
de IA, cada um com uma função estreita e um contrato estrito — mas quem os
coordena é **código determinístico**, não um LLM.

| "Agente" especialista | Função | Modelo | Contrato |
|---|---|---|---|
| **Triador** | classifica urgência de cada comunicação | Haiku (barato, 1 chamada/item) | schema estrito; ambíguo vira "não sei classificar", nunca palpite |
| **Extrator** | lê ata/PDF → fatos estruturados | Opus, **dupla extração** | todo fato com trecho literal, verificado contra o documento |
| **Redator** | rascunho do aviso ao cliente | Opus | produz rascunho; **jamais** envia |
| **Pesquisador** (pontual) | calendários, atos de TRT | agente com busca web | saída sempre conferida por humano antes de entrar no banco |

O **organizador** — coleta → dedup → extração → triagem → propostas → aprovação
→ execução — é um worker determinístico. Quatro motivos, todos deste projeto:

1. **O fluxo é fixo.** Toda manhã, os mesmos passos na mesma ordem. Não existe
   decisão aberta para um LLM tomar — orquestração por IA aqui só adicionaria
   não-determinismo sem comprar nada.
2. **As garantias críticas precisam ser prováveis por teste.** "Erro nunca é fim
   de lista" (S2), idempotência, "0 itens ≠ não há nada" — isso passou por teste
   de mutação. Prompt não passa em teste de mutação. Um organizador-LLM que num
   dia resolve pular uma página perde uma intimação **em silêncio**.
3. **Auditabilidade** é prioridade 3 do projeto. Pipeline determinístico é
   reproduzível passo a passo; decisão de agente orquestrador não é.
4. **Falha às 7h tem que ser barulhenta.** Worker que quebra dispara heartbeat;
   agente que "se vira" mascara a falha.

A regra de bolso: **IA decide conteúdo (o que um texto diz, quão urgente
parece); código decide processo (o que rodar, quando, o que fazer com falha).**
E cada decisão de conteúdo da IA sai com fonte citada e verificada.

**Exceção consciente:** no modo piloto, o Claude é de fato o organizador — mas
com o Luigi aprovando cada ação externa. É temporário, supervisionado, e serve
justamente para calibrar as regras que o organizador determinístico vai receber.

**Porta aberta para o futuro:** um agente conversacional *read-only* — "o que
ficou definido na ata do processo X?", "quais parcelas faltam da ALFA?" — é
um bom caso de agente de verdade, porque erro ali custa uma resposta ruim, não
um prazo. Candidato natural à Fase 9.

## O que já existe · o que falta

| Peça | Estado |
|---|---|
| **Ingestão DJEN de produção** (3 OABs, dedup, status por fonte, auditoria) | ✅ **rodando desde 10/08** (`src/adapters/djen.mjs`) |
| **Banco de obrigações** (parcelas/custas ressurgem sozinhas; condicionais com gatilho) | ✅ 16 carregadas dos 2 acordos |
| **Gerador de briefing local** (triagem por regras, cartões, partes, fontes, vencimentos, cobertura) | ✅ `npm run briefing` — 98 testes verdes |
| **Botão Aprovar → agenda** (página de confirmação no Apps Script: convidados em checkbox, aviso de duplicata, cria evento com cor + registro de auditoria) | 🟡 código pronto ([deploy/apps-script-escritorio.md](deploy/apps-script-escritorio.md)) — falta o Luigi implantar e informar a URL |
| **Vigia do vigia** (8h: briefing não chegou → alerta 🚨 com roteiro de diagnóstico) | 🟡 no mesmo script, falta implantar |
| **Entrega local por token** (sistema local → POST ao Apps Script → e-mail enviado; elimina a dependência do CLI para entrega no bloco 3) | 🟡 idem |
| Coleta DJEN segura (paginação, rate limit, erro ≠ fim) | ✅ testada (spike, 2 implementações) |
| Extração de texto de PDF + verificação de citação | ✅ medida no S5; produção usará pdfjs-dist |
| Regra da data-base (disponibilização +1 útil) | ✅ confirmada com dado real |
| Fundação: banco, auditoria, idempotência, segredos, jobs | ✅ 70 testes verdes |
| Motor de prazos (segunda dupla de olhos) | ⚠️ provisório por decisão — tudo sai CONFIRMAR |
| Calendários dos 6 tribunais | 🔴 a coletar (3 datas do TRT12 já deduzidas) |
| Triagem de urgência | 🔴 a calibrar (piloto) |
| Briefing + tela de aprovação | 🔴 a construir (Fases 2/4) |
| Executor de agenda (OAuth, idempotência) | 🔴 Fase 6 · no piloto: conector |
| Leitura de e-mail (repasses das empresas) | 🔴 decisão de escopo pendente (readonly) |
| Medição de cobertura (S3) | ⏳ registro dela chega ~23/08 |

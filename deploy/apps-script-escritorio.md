# Apps Script do escritório v4 — vigia + vigia-do-vigia + botão Aprovar de UM clique

> **v4 (18/08, pedido do Luigi — "não é intuitivo"):** morreu a página
> intermediária de confirmação. O clique no e-mail **cria o evento na hora** e
> a página só confirma: "✅ Evento criado" + **📅 Abrir na agenda** + **↩️
> Desfazer**. O cartão do e-mail já mostra data, partes e convidados — o
> clique é a aprovação informada; ajuste de convidados agora se faz na própria
> agenda (interface natural do Google). Proteções mantidas: token, **trava de
> clique repetido** (mesmo nº de processo no mesmo dia → "já está na agenda",
> não duplica), auditoria por e-mail, rascunho de aviso ao cliente (v3.2) e
> todas as regras de hora/link/data. Atualizar: colar `doGet`/`doPost` +
> **Nova versão**.
>
> **v3.2 (12/08, casos reais do 1º dia todo automático):** (a) o rascunho de
> aviso ao cliente nasce sempre que a conversa "PROCESSO [PARTE]" existir no
> Gmail — antes exigia convidados sugeridos, e a primeira perícia aprovada (de
> um cliente fora do cadastro) ficou sem aviso; (b) aprovação SEM hora publicada vira
> evento de DIA INTEIRO com "⏰ hora a confirmar" (antes inventava 09:00 em
> silêncio); (c) sem link de sala na publicação, a descrição do evento avisa
> "conferir no PJe"; (d) a página de sucesso diz quando NÃO criou o aviso, e
> por quê; (e) a conversa do processo só vale se CITA o nº do processo —
> nome igual sem o número pode ser homônimo, e responder no caso errado
> mandaria informação ao cliente errado (regra do Luigi, 12/08).
> Atualizar = colar `doGet`/`doPost` + **Nova versão** (como ontem).
>
> **v3.1 (11/08 à tarde, feedback das advogadas):** ao criar o evento, o botão
> agora também deixa um **rascunho de aviso ao cliente** no Gmail (assunto
> "PROCESSO [PARTE]", como resposta na conversa do processo quando ela já
> existe) — sempre rascunho, quem revisa e envia é a advogada. Foi o que
> faltou na primeira aprovação real, em 11/08. A página de sucesso também
> ganhou o link "📅 Ver na agenda". Para atualizar: colar por cima **apenas**
> as funções `doGet` e `doPost` (o vigia v3 não mudou) **E republicar**:
>
> ⚠️ **Colar NÃO basta para o botão**: `doGet`/`doPost` rodam a **versão
> implantada** do App da Web, que fica congelada — só os acionadores (vigia/
> conferidor) rodam o código do editor. Depois de salvar, vá em **Implantar →
> Gerenciar implantações → ✏️ (editar) → Versão: "Nova versão" → Implantar**.
> A URL continua a mesma. (É por isso que o gate de token nunca ativou: a
> implantação ainda serve a versão antiga.)

**Substitui** o script `envia-briefing` (cole por cima do código existente, no
mesmo projeto). Quatro funções num arquivo só:

> **Por que v3 (incidente de 11/08/2026):** o vigia v2 abria TODOS os rascunhos
> da caixa a cada 15 minutos (1 chamada ao Gmail por rascunho, 96 rodadas/dia)
> e estourou a cota diária do Gmail — "Service invoked too many times for one
> day: gmail". Com a cota estourada, morreram o vigia E o alarme das 8h (mesmo
> projeto, mesma cota): o briefing não saiu e ninguém avisou. O v3 conserta o
> desenho: só roda em dia útil e dentro da janela 6h–13h, e cada rodada gasta
> **2 buscas** (briefing já saiu hoje? existe rascunho de hoje?) — a varredura
> de rascunhos só acontece na rodada em que o rascunho do dia existe, uma vez.

| Função | O que faz | Gatilho |
|---|---|---|
| `enviarBriefingDoDia` | envia o rascunho do briefing do dia (o vigia de sempre) | a cada 15 min (já existe) |
| `conferirBriefingDoDia` | **vigia do vigia**: às 8h confere se o briefing chegou; se não, manda alerta 🚨 | diário, 8h–9h (criar) |
| `doGet` aprovação (v4) | **o botão Aprovar de UM clique**: cria o evento na hora (cor + lembretes + convites + trava anti-duplicata) e confirma com "Abrir na agenda" e "Desfazer"; deixa o rascunho de aviso ao cliente | Web App (implantar) |
| `doPost` entrega | canal para o sistema local enviar o briefing por HTTPS (bloco 3, protegido por token) | Web App (o mesmo) |

**Atualização v2 → v3:** basta colar o código novo por cima do antigo e salvar
(Ctrl+S). Os acionadores existentes (15 em 15 min; diário 8h–9h) continuam
valendo — nada mais a fazer.

## Instalação (~10 min, uma vez)

1. **script.google.com** → abra o projeto `envia-briefing` → apague tudo e cole o código abaixo.
2. O `TOKEN` já vem preenchido (o mesmo de `dados/config.json`). Não precisa mudar.
3. ⚙️ do projeto → confira **Fuso horário: America/Sao_Paulo**.
4. Salve. Rode uma vez a função `conferirBriefingDoDia` (▶) para o Google pedir
   as novas autorizações (agora inclui **Agenda**) — mesmo fluxo do Avançado →
   Permitir.
5. **Acionadores** → adicionar: função `conferirBriefingDoDia` · baseado no
   tempo · timer diário · **8h às 9h** · notificar-me imediatamente.
6. **Implantar → Nova implantação → App da Web**:
   - Executar como: **Eu (a conta do escritório)**
   - Quem pode acessar: **Qualquer pessoa** — ⚠️ NÃO use "Somente eu". Por quê:
     os celulares das advogadas estão logados nas contas PESSOAIS delas, não na
     do escritório; com "Somente eu" o botão dá "Não foi possível abrir o
     arquivo". Com "Qualquer pessoa" + "Executar como: eu", o clique de qualquer
     conta cria o evento no calendário do escritório, sem exigir login.
   - Segurança: a URL é secreta (só vive nos e-mails do escritório) e as ações
     são limitadas (criar evento na agenda do escritório + e-mail de registro só
     para a própria caixa). Endurecimento opcional com token: ver nota no fim.
   - **Copie a URL** e **me mande**.

**Se já implantou como "Somente eu":** Implantar → **Gerenciar implantações** →
✏️ (editar) → "Quem pode acessar" → **Qualquer pessoa** → Implantar. Mantém a
mesma URL.

## O código

```javascript
// ═══════════════ CONFIG ═══════════════
const EMAIL_ESCRITORIO = "escritorio@exemplo.com";
// Token secreto: a página de aprovação só abre com ?tk=ESTE-VALOR na URL.
// ⚠️ NÃO escreva o token aqui — este arquivo é versionado. Copie o valor de
// "aprovacao_token" em dados/config.json (que fica fora do git) e cole no
// Apps Script, que não é versionado.
const TOKEN = "COLE-AQUI-O-aprovacao_token-DE-dados/config.json";
const CORES = { "5": CalendarApp.EventColor.YELLOW,  // Banana — Advogada 1
                "3": CalendarApp.EventColor.MAUVE,   // Uva — Advogada 2
                "10": CalendarApp.EventColor.GREEN };// Manjericão — Advogado 3

// ═══════ 1. VIGIA v3: envia o rascunho do briefing do dia ═══════
// À prova de cota: fim de semana e fora de 6h–13h nem toca o Gmail; dentro da
// janela gasta 2 buscas por rodada; a varredura de rascunhos (1 chamada por
// rascunho!) só roda quando a busca acha o rascunho DO DIA — uma vez por dia.
function enviarBriefingDoDia() {
  const agora = new Date();
  const dia = agora.getDay();
  if (dia === 0 || dia === 6) return; // fim de semana não tem briefing
  const hora = Number(Utilities.formatDate(agora, "America/Sao_Paulo", "H"));
  if (hora < 6 || hora >= 13) return; // briefing é coisa da manhã

  const hoje = Utilities.formatDate(agora, "America/Sao_Paulo", "dd/MM/yyyy");
  // Já foi enviado hoje? (1 busca) — nunca enviar duas vezes.
  const jaFoi = GmailApp.search('in:sent subject:"Briefing — ' + hoje + '"', 0, 1);
  if (jaFoi.length > 0) return;
  // Existe rascunho do dia? (1 busca) — só então vale abrir os rascunhos.
  const tem = GmailApp.search('in:draft subject:"Briefing — ' + hoje + '"', 0, 1);
  if (tem.length === 0) return;

  const rascunhos = GmailApp.getDrafts();
  for (const rascunho of rascunhos) {
    const assunto = rascunho.getMessage().getSubject() || "";
    if (assunto.indexOf("Briefing") !== -1 && assunto.indexOf(hoje) !== -1) {
      rascunho.send();
      return; // um briefing por dia — para na hora
    }
  }
}

// ═══════ 2. VIGIA DO VIGIA v3: o briefing chegou? ═══════
function conferirBriefingDoDia() {
  const agora = new Date();
  const dia = agora.getDay();
  if (dia === 0 || dia === 6) return; // fim de semana não tem briefing
  const hora = Number(Utilities.formatDate(agora, "America/Sao_Paulo", "H"));
  if (hora < 7 || hora >= 11) return; // guarda extra: só confere de manhã
  const hoje = Utilities.formatDate(agora, "America/Sao_Paulo", "dd/MM/yyyy");
  // -in:draft: rascunho parado NÃO conta como entregue (enviado/recebido conta).
  const achou = GmailApp.search('subject:"Briefing — ' + hoje + '" -in:draft', 0, 1);
  if (achou.length === 0) {
    GmailApp.sendEmail(
      EMAIL_ESCRITORIO,
      "🚨 O briefing de " + hoje + " NÃO chegou",
      "O vigia das 8h não encontrou o briefing de hoje na caixa de entrada.\n\n" +
      "Onde olhar, nesta ordem:\n" +
      "1. Pasta Rascunhos — a rotina criou e o envio falhou? Se o rascunho está lá, é só abrir e Enviar.\n" +
      "2. https://claude.ai/code/routines — a rotina das 7h rodou?\n" +
      "3. script.google.com → Execuções — o envia-briefing deu erro?\n" +
      "4. Se o erro for 'Service invoked too many times for one day: gmail', a cota diária estourou: envie o rascunho na mão; a cota renova de madrugada.\n\n" +
      "Enquanto isso, a conferência manual do PJe/eproc/Diário vale como sempre."
    );
  }
}

// ═══════ 3. BOTÃO APROVAR v4 — UM clique: cria e confirma ═══════
// Pedido do Luigi (18/08): sem página intermediária. O e-mail já mostra data,
// partes e convidados; o clique CRIA o evento na hora e a página só confirma,
// com "Abrir na agenda" e "Desfazer". Proteções mantidas: token, trava de
// clique repetido (mesmo processo no mesmo dia NÃO duplica), auditoria por
// e-mail e o rascunho de aviso ao cliente (v3.2, trava de homônimos).

function linkDoEvento(ev) {
  try {
    return "https://www.google.com/calendar/event?eid=" +
      Utilities.base64Encode(ev.getId().split("@")[0] + " " + EMAIL_ESCRITORIO);
  } catch (err) { return ""; }
}

function botaoAzul(url, rotulo) {
  return '<p><a href="' + url + '" style="display:inline-block;background:#eef4fb;border:2px solid #1a4d8f;color:#1a4d8f;padding:9px 18px;border-radius:5px;text-decoration:none;font-weight:bold">' + rotulo + "</a></p>";
}

function pagina(titulo, corpoHtml) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:Georgia,serif;max-width:480px;margin:40px auto;text-align:center;color:#222">' +
    corpoHtml + "</div>").setTitle(titulo);
}

function doGet(e) {
  const p = e.parameter;
  if (p.tk !== TOKEN) return pagina("Acesso negado",
    "<h2>🔒 Acesso negado</h2><p>Link inválido ou incompleto. Abra o botão a partir do briefing por e-mail.</p>");

  // ↩️ Desfazer: apaga o evento recém-criado (convidados recebem cancelamento).
  if (p.acao === "desfazer") {
    try {
      const ev = CalendarApp.getDefaultCalendar().getEventById(p.ev);
      const titulo = ev.getTitle();
      ev.deleteEvent();
      GmailApp.sendEmail(EMAIL_ESCRITORIO, "↩️ DESFEITO via botão: " + titulo,
        "Evento apagado da agenda pelo botão Desfazer. Convidados receberam o cancelamento.");
      return pagina("Desfeito", "<h2>↩️ Evento desfeito</h2><p>" + titulo +
        "</p><p style=\"font-size:13px;color:#555\">Se um rascunho de aviso ao cliente foi criado nos Rascunhos, apague-o também.</p>");
    } catch (err) {
      return pagina("Desfazer", "<h2>Não consegui desfazer</h2><p>O evento pode já ter sido removido. Confira na agenda.</p>");
    }
  }

  if (p.acao !== "aprovar") return HtmlService.createHtmlOutput("Ação desconhecida.");

  const dataBr = (p.d || "").split("-").reverse().join("/");
  const partes = p.d.split("-").map(Number);
  const cal = CalendarApp.getDefaultCalendar();

  // Trava de clique repetido + "já estava na agenda": mesmo Nº DE PROCESSO na
  // descrição (ou título idêntico) no mesmo dia → mostra o existente, não cria.
  var outrosDoDia = [];
  try {
    const doDia = cal.getEventsForDay(new Date(partes[0], partes[1] - 1, partes[2]));
    for (var i = 0; i < doDia.length; i++) {
      const evd = doDia[i];
      if ((p.proc && (evd.getDescription() || "").indexOf(p.proc) !== -1) || evd.getTitle() === (p.t || "")) {
        return pagina("Já está na agenda",
          "<h2>✔️ Já está na agenda</h2><p><b>" + evd.getTitle() + "</b><br>" + dataBr + "</p>" +
          (linkDoEvento(evd) ? botaoAzul(linkDoEvento(evd), "📅 Abrir na agenda") : "") +
          "<p style=\"font-size:13px;color:#555\">Nada foi criado — clique repetido não duplica.</p>");
      }
      outrosDoDia.push(Utilities.formatDate(evd.getStartTime(), "America/Sao_Paulo", "HH:mm") + " — " + evd.getTitle());
    }
  } catch (err) {}

  // ── Criação imediata (mesmas regras da v3.2) ──
  const convidados = (p.conv || "").split(",").filter(function (x) { return x; }).join(",");
  const notaSemLink = p.loc ? "" : "\nSala/local: não constava na publicação — conferir no PJe.";
  const opcoes = { description: (p.desc || "") + notaSemLink, location: p.loc || "" };
  if (convidados) { opcoes.guests = convidados; opcoes.sendInvites = true; }
  var ev;
  if (p.h) {
    const hm = p.h.split(":").map(Number);
    const inicio = new Date(partes[0], partes[1] - 1, partes[2], hm[0], hm[1]);
    ev = cal.createEvent(p.t || "Evento", inicio, new Date(inicio.getTime() + Number(p.dur || 60) * 60000), opcoes);
  } else {
    // Sem hora publicada: dia inteiro + aviso — nunca inventar 09:00.
    ev = cal.createAllDayEvent("⏰ hora a confirmar — " + (p.t || "Evento"),
      new Date(partes[0], partes[1] - 1, partes[2]), opcoes);
  }
  if (CORES[p.cor]) ev.setColor(CORES[p.cor]);
  ev.addPopupReminder(10); ev.addPopupReminder(30);

  // Registro de auditoria — fica na caixa, legível pelo assistente.
  GmailApp.sendEmail(EMAIL_ESCRITORIO,
    "✅ APROVADO via botão: " + (p.t || "evento") + " em " + dataBr,
    "Evento criado na agenda.\nProcesso: " + (p.proc || "-") +
    "\nConvidados: " + (convidados || "nenhum") +
    "\nHorário: " + dataBr + (p.h ? " às " + p.h : " (hora a confirmar)"));

  // Rascunho de aviso ao cliente (v3.2): a conversa do processo decide — e só
  // vale se CITA este nº de processo (homônimo não vale). SEMPRE rascunho.
  var avisoCriado = false, avisoMotivo = "";
  try {
    const assunto = "PROCESSO " + (p.pn || p.proc || "");
    const corpo =
      "Prezados, [EDITAR: saudação]\n\n" +
      "Informo que foi designado o compromisso abaixo:\n\n" +
      (p.t ? p.t + "\n" : "") +
      "Processo: " + (p.proc || "-") + "\n" +
      "Data: " + dataBr + (p.h ? " às " + p.h : " (hora a confirmar no PJe)") + "\n" +
      (p.loc ? "Sala virtual (link): " + p.loc + "\n" : "Local: [EDITAR: conferir no PJe]\n") +
      "\nFavor agendar. [EDITAR: quem deve participar — preposto(a)? testemunhas? assistente técnico?]\n\n" +
      "Att.\n[EDITAR: assinatura]";
    const conversa = (p.pn && p.proc)
      ? GmailApp.search('subject:"' + assunto + '" "' + p.proc + '"', 0, 1)
      : [];
    if (conversa.length > 0) { conversa[0].createDraftReplyAll(corpo); avisoCriado = true; }
    else if (convidados) { GmailApp.createDraft(convidados, assunto, corpo); avisoCriado = true; }
    else avisoMotivo = "nenhuma conversa \"" + assunto + "\" citando o processo " + (p.proc || "?") + " e sem convidados sugeridos";
  } catch (err) { avisoMotivo = "erro ao criar: " + err; }

  const urlDesfazer = ScriptApp.getService().getUrl() + "?acao=desfazer&tk=" + TOKEN + "&ev=" + encodeURIComponent(ev.getId());
  return pagina("Evento criado",
    "<h2>✅ Evento criado</h2><p><b>" + (p.t || "") + "</b><br>" + dataBr + (p.h ? " às " + p.h : " · ⏰ hora a confirmar") + "</p>" +
    "<p style=\"font-size:13px\">" + (convidados ? "Convites enviados para: " + convidados : "Sem convidados.") + "</p>" +
    (linkDoEvento(ev) ? botaoAzul(linkDoEvento(ev), "📅 Abrir na agenda") : "") +
    '<p><a href="' + urlDesfazer + '" style="display:inline-block;border:2px solid #b71c1c;color:#b71c1c;padding:7px 14px;border-radius:5px;text-decoration:none;font-size:13px">↩️ Desfazer</a></p>' +
    (avisoCriado
      ? '<p style="background:#fff8e1;border:1px solid #e0c060;border-radius:6px;padding:8px;font-size:13px">📝 Deixei um <b>rascunho de aviso ao cliente</b> nos Rascunhos ("PROCESSO…") — revise os campos [EDITAR] e envie.</p>'
      : '<p style="background:#fdecea;border:1px solid #d9a0a0;border-radius:6px;padding:8px;font-size:13px">✋ <b>Nenhum rascunho de aviso criado</b>: ' + (avisoMotivo || "motivo desconhecido") + '.</p>') +
    (outrosDoDia.length
      ? '<p style="font-size:12px;color:#8a6100">⚠️ Outros eventos neste dia: ' + outrosDoDia.join(" · ") + "</p>"
      : ""));
}

function doPost(e) {
  const p = e.parameter;

  // 3b. Criação do evento aprovado
  if (p.acao === "criar") {
    if (p.tk !== TOKEN) return HtmlService.createHtmlOutput("🔒 Acesso negado.");
    const partes = p.d.split("-").map(Number);
    // Para HUMANOS, data sempre em dd/mm/aaaa (regra de 12/08) — o ISO fica
    // só nos parâmetros e na API.
    const dataBr = p.d.split("-").reverse().join("/");

    const convidados = [].concat(e.parameters.conv || []).join(",");
    // v3.2 — sem link de sala na publicação, o evento DIZ isso (caso real de
    // 12/08: "não veio o link do zoom" — não veio porque não foi publicado).
    const notaSemLink = p.loc ? "" : "\nSala/local: não constava na publicação — conferir no PJe.";
    const opcoes = { description: (p.desc || "") + notaSemLink, location: p.loc || "" };
    if (convidados) { opcoes.guests = convidados; opcoes.sendInvites = true; }

    const cal = CalendarApp.getDefaultCalendar();
    var ev;
    if (p.h) {
      const hm = p.h.split(":").map(Number);
      const inicio = new Date(partes[0], partes[1] - 1, partes[2], hm[0], hm[1]);
      const fim = new Date(inicio.getTime() + Number(p.dur || 60) * 60000);
      ev = cal.createEvent(p.t || "Evento", inicio, fim, opcoes);
    } else {
      // v3.2 — hora não publicada: dia inteiro + aviso no título. Inventar
      // 09:00 em silêncio (v3.1) fez a perícia de 12/08 nascer com hora errada.
      ev = cal.createAllDayEvent("⏰ hora a confirmar — " + (p.t || "Evento"),
        new Date(partes[0], partes[1] - 1, partes[2]), opcoes);
    }
    if (CORES[p.cor]) ev.setColor(CORES[p.cor]);
    ev.addPopupReminder(10); ev.addPopupReminder(30);

    // Registro de auditoria — fica na caixa, legível pelo assistente.
    GmailApp.sendEmail(EMAIL_ESCRITORIO,
      "✅ APROVADO via botão: " + (p.t || "evento") + " em " + dataBr,
      "Evento criado na agenda.\nProcesso: " + (p.proc || "-") +
      "\nConvidados: " + (convidados || "nenhum") +
      "\nHorário: " + dataBr + (p.h ? " às " + p.h : " (hora a confirmar)"));

    // Rascunho de aviso ao cliente (pedido das advogadas, 11/08): nasce JUNTO
    // da aprovação. SEMPRE rascunho — quem revisa e envia é a advogada.
    // v3.2 — a CONVERSA do processo decide, não os convidados: com a conversa
    // "PROCESSO [PARTE]" no Gmail, o rascunho nasce como resposta a TODOS dela
    // (quem cuida do caso), MESMO sem convidados sugeridos — foi o furo da
    // 1ª perícia aprovada, em 12/08 (cliente fora do cadastro = sem aviso).
    // Sem conversa, vale a lista de convidados; sem nenhum dos dois, a página
    // avisa que não criou, e por quê. `pn` = nome do empregado (vem no botão).
    var avisoCriado = false, avisoMotivo = "";
    try {
      const assunto = "PROCESSO " + (p.pn || p.proc || "");
      const corpo =
        "Prezados, [EDITAR: saudação]\n\n" +
        "Informo que foi designado o compromisso abaixo:\n\n" +
        (p.t ? p.t + "\n" : "") +
        "Processo: " + (p.proc || "-") + "\n" +
        "Data: " + dataBr + (p.h ? " às " + p.h : " (hora a confirmar no PJe)") + "\n" +
        (p.loc ? "Sala virtual (link): " + p.loc + "\n" : "Local: [EDITAR: conferir no PJe]\n") +
        "\nFavor agendar. [EDITAR: quem deve participar — preposto(a)? testemunhas? assistente técnico?]\n\n" +
        "Att.\n[EDITAR: assinatura]";
      // Regra do Luigi (12/08): NUNCA responder numa conversa só pelo nome —
      // homônimos existem, e responder no caso errado mandaria informação do
      // processo para o cliente errado. A conversa só vale se, além do
      // assunto, ela CITA este nº de processo em algum e-mail.
      const conversa = (p.pn && p.proc)
        ? GmailApp.search('subject:"' + assunto + '" "' + p.proc + '"', 0, 1)
        : [];
      if (conversa.length > 0) { conversa[0].createDraftReplyAll(corpo); avisoCriado = true; }
      else if (convidados) { GmailApp.createDraft(convidados, assunto, corpo); avisoCriado = true; }
      else avisoMotivo = "nenhuma conversa \"" + assunto + "\" que cite o processo " + (p.proc || "?") + " (nome igual sem o nº não vale — pode ser homônimo) e sem convidados sugeridos — escreva o aviso manualmente se precisar";
    } catch (err) { avisoMotivo = "erro ao criar: " + err; }

    // Link direto para o evento criado — o clique termina NA agenda.
    var linkAgenda = "";
    try {
      linkAgenda = "https://www.google.com/calendar/event?eid=" +
        Utilities.base64Encode(ev.getId().split("@")[0] + " " + EMAIL_ESCRITORIO);
    } catch (err) { linkAgenda = ""; }

    return HtmlService.createHtmlOutput(
      '<div style="font-family:Georgia,serif;max-width:480px;margin:40px auto;text-align:center;color:#222">' +
      "<h2>✅ Evento criado</h2><p>" + (p.t || "") + "<br>" + dataBr + (p.h ? " às " + p.h : " · ⏰ hora a confirmar") + "</p>" +
      "<p>" + (convidados ? "Convites enviados para: " + convidados : "Sem convidados.") + "</p>" +
      (linkAgenda
        ? '<p><a href="' + linkAgenda + '" style="display:inline-block;background:#eef4fb;border:2px solid #1a4d8f;color:#1a4d8f;padding:9px 18px;border-radius:5px;text-decoration:none;font-weight:bold">📅 Ver na agenda</a></p>'
        : "") +
      (avisoCriado
        ? '<p style="background:#fff8e1;border:1px solid #e0c060;border-radius:6px;padding:8px">📝 Deixei um <b>rascunho de aviso ao cliente</b> nos Rascunhos do Gmail ("PROCESSO…") — revise os campos [EDITAR] e envie.</p>'
        : '<p style="background:#fdecea;border:1px solid #d9a0a0;border-radius:6px;padding:8px">✋ <b>Nenhum rascunho de aviso criado</b>: ' + (avisoMotivo || "motivo desconhecido") + '.</p>') + "</div>");
  }

  // 3c. Entrega do briefing pelo sistema local (bloco 3) — exige o token.
  if (p.acao === "entregar") {
    if (p.tk !== TOKEN) return HtmlService.createHtmlOutput("token inválido");
    GmailApp.sendEmail(EMAIL_ESCRITORIO, p.assunto || "☕ Briefing", "Versão HTML no corpo.", { htmlBody: p.html || "" });
    return HtmlService.createHtmlOutput("ok");
  }

  return HtmlService.createHtmlOutput("Ação desconhecida.");
}
```

## Segurança, dito claramente

- A página de aprovação só executa **logado na conta do escritório** ("Somente eu").
- O evento só nasce depois do clique em "Criar evento" na página — o clique no
  e-mail sozinho **não cria nada** (dá para revisar e desistir).
- Cada criação gera **e-mail de registro** ("✅ APROVADO via botão…") — trilha
  de auditoria na própria caixa.
- A entrega por token só **envia e-mail para a própria caixa** — quem tiver o
  token não consegue mandar nada para terceiros.
- Desligar tudo: excluir a implantação e os acionadores. 30 segundos.

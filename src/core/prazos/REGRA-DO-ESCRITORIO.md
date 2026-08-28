# Regra de contagem de prazos — conforme informada pelo escritório

**Informada em:** 09/08/2026 · **Complementada em:** 09/08/2026 (respostas das
advogadas + telas de expediente do PJe) · **Estado:** ⚠️ NÃO VALIDADA — faltam os
10 casos de referência.

> Este documento é a fonte da verdade sobre a regra. O código em `index.mjs` e
> `calendario.mjs` deve refletir **isto**, não a minha leitura da lei. Onde a
> regra informada divergir do que encontrei na legislação, a divergência fica
> registrada aqui e **é resolvida por ela**, não por mim.

## Regra informada (texto literal, 09/08/2026)

1. **Dias úteis:** quando a citação é pelo DJEN, contam-se os 15 dias para a defesa após 5 dias do sistema.
2. **Data de início:** 1 dia após a publicação da intimação.
3. **Data de vencimento:** na data do último dia do prazo.
4. **Feriados:** cada TRT tem seu calendário.
5. **Suspensões do TRT:** cada um tem o seu; ver calendário oficial no site de cada TRT.
6. **Recesso/suspensão de fim de ano:** cada TRT tem o seu, porém geralmente **de 19 de dezembro a 6 de janeiro**, ao recesso judiciário.
7. **Publicação × disponibilização:** o prazo conta da **publicação**, não da disponibilização.
8. **Intimação pessoal/ciência:** a ciência se dá na data e o prazo começa no **dia útil seguinte**.
9. **Prorrogação:** quando o vencimento cai em dia sem expediente, vai para o primeiro dia útil subsequente.

---

# ✅ A regra de contagem, confirmada contra o próprio PJe

Em 09/08/2026 ela enviou capturas da tela **"Expediente(s) do processo"** do PJe,
de três processos reais — a tela em que ela acompanha prazos. Essa tela publica
`Data de Ciência`, `Prazo` (quantidade) e `Fim do Prazo` **calculado pelo
tribunal**. Refiz as contas linha a linha.

**Três linhas fecham sem nenhuma suposição de calendário:**

| Processo | Data de Ciência | Prazo | Fim (PJe) | Conferência |
|---|---|---|---|---|
| 0900002-26.2025.5.12.0901 | 19/05/2026 (ter) | 10 | 02/06/2026 | ✅ |
| 0000012-13 | 22/04/2026 (qua) | 5 | 29/04/2026 | ✅ |
| 0000002-22.2026.5.12.0002 | 09/06/2026 (ter) | 15 | 30/06/2026 | ✅ |

**A regra que reproduz as três:**

```
Data de Ciência (= data de publicação)
  → termo inicial = primeiro dia útil SEGUINTE à ciência
     → contam-se N dias úteis a partir dele, INCLUSIVE
        → vencimento = o N-ésimo dia útil
```

**É exatamente o que `calcularPrazo()` já faz** para `dias_uteis`: `cursor =
dataBase + 1`, escorrega para o primeiro dia útil, conta N. A arquitetura está
certa. O que falta é calendário completo e data-base correta — não lógica.

⚠️ Isto **não** fecha o Portão 1. Confirma que o motor reproduz a conta do
*tribunal*; os 10 casos existem para confirmar que reproduz a conta **dela**, que
é quem responde pelo prazo. Se as duas divergirem, é a informação mais
importante que teremos.

---

# 🟢 DIVERGÊNCIA 1 — RESOLVIDA em 09/08/2026

**Pergunta:** recesso até 06/01 (informado) ou suspensão até 20/01 (art. 775-A CLT)?

**Resposta dela:** **os dois existem e são coisas distintas.**

| | Recesso forense | Suspensão de prazos |
|---|---|---|
| O que é | Não há expediente no tribunal | O prazo não corre |
| Período | **20/12 a 06/01** | **20/12 a 20/01** (art. 775-A CLT) |

Início do recesso confirmado por ela: **dia 20** (a regra informada dizia 19 —
corrigido).

**Consequência para o cálculo:** quem governa é a **suspensão**. Prazo parado de
20/12 a 20/01, retoma em **21/01**. O recesso está inteiramente contido nessa
janela, então não altera a conta — mas continua importando como período sem
expediente para prorrogação de vencimento e para agendamento.

**Estado no código:** `suspensaoRecesso()` já usa 20/12–20/01. ✅ Correto.
Continua com `confirmado_em = NULL` até ela conferir a entrada, e cada TRT pode
prorrogar por ato próprio (o TRT-2 prorrogou até 24/01 num ano).

---

# 🟢 DIVERGÊNCIA 2 — RESOLVIDA em 09/08/2026, com dado real

**A questão:** a API do DJEN entrega `data_disponibilizacao`. A regra 7 manda
contar da **publicação**.

**Resposta dela:** acredita que sim, publicação = 1º dia útil seguinte à
disponibilização (Lei 11.419/2006, art. 4º, §3º) — **mas ressalvou que ela nem vê
a disponibilização; só vê a publicação.** Ou seja: é a premissa que ela usa, não
algo que ela confere.

**O que as telas do PJe acrescentam.** Em todas as linhas de Diário Eletrônico, o
intervalo entre `Data de Criação` e `Data de Ciência` é de **exatamente 2 dias
úteis**, consistentemente:

| Criação | Ciência | Intervalo |
|---|---|---|
| 03/08/2026 (seg) | 05/08/2026 (qua) | 2 dias úteis |
| 02/08/2026 (dom) | 04/08/2026 (ter) | 2 dias úteis |
| 05/08/2026 (qua) | 07/08/2026 (sex) | 2 dias úteis |
| 09/04/2026 (qui) | 13/04/2026 (seg) | 2 dias úteis |
| 31/07/2026 (sex) | 04/08/2026 (ter) | 2 dias úteis |

Isso é compatível com a cadeia `criação → +1 dia útil → disponibilização → +1 dia
útil → publicação`, e indica que **a "Data de Ciência" do PJe é a data de
publicação** — não a disponibilização.

**A cadeia, então:**

```
data_disponibilizacao (campo do DJEN)
   → publicação = 1º dia útil seguinte à disponibilização
      → termo inicial = 1º dia útil seguinte à publicação
         → contagem em dias úteis
            → vencimento = último dia
```

**✅ Verificação feita em 09/08/2026.** Consulta read-only ao DJEN público
(OAB 10001/SC, janela 01–08/08/2026) comparada com a `Data de Ciência` das telas,
nos mesmos processos:

| Processo | `data_disponibilizacao` (API) | Data de Ciência (tela) | Diferença |
|---|---|---|---|
| 0900002-26.2025.5.12.0901 | 04/08/2026 (ter) | 05/08/2026 (qua) | **+1 dia útil** |
| 0000012-13 | 03/08/2026 (seg) | 04/08/2026 (ter) | **+1 dia útil** |
| 0000002-22.2026.5.12.0002 | 06/08/2026 (qui) | 07/08/2026 (sex) | **+1 dia útil** |
| 0900001 (intimação anterior) | 03/08/2026 (seg) | 04/08/2026 (ter) | **+1 dia útil** |

**4 pares independentes, todos +1 dia útil.** A cadeia está confirmada:
`publicação = disponibilização + 1 dia útil`, e a "Data de Ciência" do PJe é a
publicação.

**Regra para o mapeamento da Fase 2/3, agora fechada:** a data-base do prazo
NUNCA é o campo `data_disponibilizacao` cru — é ele **+ 1 dia útil**. Usar o
campo direto adiantaria todo prazo em 1 a 3 dias, com aparência de correto.

---

# 🟢 AMBIGUIDADE 1 — RESOLVIDA por desenho: os "5 dias" NÃO entram no motor

**A regra 1 dizia:** *"quando a citação é pelo DJEN, contam-se os 15 dias para a
defesa após 5 dias do sistema"*, e admitia três leituras incompatíveis.

**O que ela esclareceu:** os 5 dias valem **só quando a empresa é citada pelo
Domicílio Eletrônico**. E acrescentou o fato decisivo:

> A primeira citação vai para o **Domicílio Eletrônico das empresas clientes**,
> que a repassam ao escritório **por e-mail**. Pelo Diário chega todo o resto.

**Decisão: o motor não implementa os 5 dias.** O raciocínio:

Os 5 dias são uma forma de **estimar** a data de ciência quando não se sabe qual
é. Mas no fluxo real quem sabe a data de ciência é a empresa, e ela a repassa.
Se o sistema perguntar a data, não precisa estimá-la.

Então: prazo de defesa a partir de citação entra com **data-base informada por
humano** — a data em que a empresa teve ciência — e daí correm os 15 dias úteis.
Sem essa data, o motor **se recusa a calcular**, como já faz.

**Requisito que nasce disto** (dela, textualmente: *"vale me avisar se veio ou
não"*): quando a citação chegar por e-mail, o sistema tem de declarar
explicitamente uma de duas coisas —

- ✅ "a data de ciência veio no repasse: DD/MM/AAAA" · ou
- ⚠️ "**a data de ciência não veio — é preciso olhar no processo**"

Nunca preencher sozinho, nunca deixar implícito. É o mesmo padrão do
`requerConfirmacao`.

**Ainda desejável:** 1 ou 2 dos 10 casos de referência serem prazos de defesa a
partir de citação. Resolveria empiricamente se ela, na prática, ainda aplica
algum acréscimo.

---

# 🟢 AMBIGUIDADE 2 — RESOLVIDA · e revela um defeito no código

**A pergunta:** o "1 dia após a publicação" da regra 2 pode cair em dia não útil?

**Resposta dela:** **"não, 1 dia após pode ser um dia não útil."** Ou seja: o
termo inicial é o dia seguinte, seja ele útil ou não; quem pula é a contagem.

**Para `dias_uteis` não muda nada.** Escorregar o início para o primeiro dia útil
ou começar num sábado e pular na contagem dá o mesmo primeiro dia contado — e as
três linhas do PJe conferidas acima confirmam que o resultado é o mesmo.

## ✅ Para `dias_corridos` mudava — CORRIGIDO em 09/08/2026

O código escorregava o início para o primeiro dia útil antes de contar, inclusive
no ramo de dias corridos. Um prazo de 10 dias corridos publicado numa **sexta**
começava na segunda e vencia **2 dias tarde demais** — erro na direção perigosa.

**Correção aplicada com autorização do Luigi** ("pode corrigir"): no ramo
`dias_corridos` o início não escorrega mais; a prorrogação do vencimento
(regra 9) permanece. Protegida por teste **não-provisório** em
`tests/prazos.test.mjs` que cita a resposta literal dela. 70 testes verdes.

---

# 🟡 LACUNA 3 — Calendários: são 6 tribunais, e faltam 3 datas já detectadas

**Resposta dela:** só os **trabalhistas e o TST**:

**TRT12 · TRT9 · TRT6 · TRT3 · TRT15 · TST** — 6 calendários, não 8.

Consulta feita nos sites de cada TRT. Carnaval e Corpus Christi: *"depende, tem
que pesquisar o calendário de cada TRT"* — ou seja, **não são feriado nacional
por presunção**; entram por ato de cada tribunal e por ano.

**Tensão com a D3 do plano** (*"escopo inclui tudo que a OAB captura, inclusive
Justiça Estadual"*). Conciliação proposta, que não contradiz nenhuma das duas:

> **Monitorar tudo, calcular prazo só onde há calendário confirmado.** Comunicação
> do TJSC/TJPR aparece no painel; o motor se recusa a calcular a data e marca
> "sem calendário confirmado para este tribunal". É o comportamento que o código
> já tem — mas precisa ser decisão consciente, não efeito colateral.

## 🔎 Três datas sem expediente deduzidas das telas — conferir no TRT12

As outras 5 linhas das telas não fecham pela regra, e todas erram na mesma
direção. Cada uma aponta um dia sem expediente que não está no calendário:

| Data deduzida | Evidência | Candidato |
|---|---|---|
| **10 ou 11/08/2026** (não dá para distinguir) | 3 linhas de agosto (fim 18/08, 12/08 e 17/08) só fecham com 1 dia sem expediente nessa janela | 11/08 — Dia do Advogado |
| **1 dia entre 14 e 20/04/2026** | ciência 13/04 + 5 dias → PJe diz 22/04; com Tiradentes (21/04) ainda falta 1 dia | emenda de Tiradentes? |
| **04 e 05/06/2026** (ambos) | criação 03/06 → ciência 09/06; só fecha se quinta e sexta forem sem expediente | Corpus Christi (04/06) + emenda |

⚠️ **Isto é dedução minha a partir das datas, não leitura do calendário oficial.**
Serve para dois fins: dizer onde procurar primeiro, e — mais importante —
demonstrar que **três atos do TRT12 que eu não tenho já produziriam três prazos
errados em processos reais**. O problema dos calendários deixou de ser teórico.

---

# ✅ DE QUEM É O PRAZO — só os nossos viram compromisso

**Decidido em 09/08/2026.** Um documento traz prazos de várias pessoas. **Só
entram no sistema os prazos do escritório e do cliente.**

| Prazo | De quem | Entra? |
|---|---|---|
| Apresentar quesitos | nosso | ✅ |
| Manifestar sobre o laudo | nosso | ✅ |
| Apresentar defesa | nosso | ✅ |
| Pagar custas, honorários periciais, parcelas do acordo | do cliente | ✅ |
| **Entregar o laudo (perito)** | **do perito** | ❌ |
| Prazo da parte contrária | do outro lado | ❌ |

Textualmente dele: *"os prazos do perito não importam... o do perito eu nem quero
saber."*

**O critério é a obrigação, não o tipo de documento.** "Honorários periciais, 30
dias, ônus da reclamada" é perícia e **é nosso**, porque quem paga é o cliente.
"50 dias para entrega do laudo" é perícia e **não é nosso**, porque quem entrega é
o perito.

**Consequência para a extração (Fase 3):** o schema precisa de um campo do tipo
`obrigado` — quem tem o dever — e um fato só vira compromisso quando `obrigado ∈
{escritório, cliente}`. Sem esse campo, o painel enche de prazo alheio e vira
ruído; e ruído é o caminho para ela parar de olhar (risco 1.3-k).

**Na prática isso já se aplica sozinho na detecção**, porque o DJEN é consultado
pela OAB dela — só devolve o que é dirigido a ela. O filtro importa mesmo é na
**leitura de documento**, onde uma ata descreve os prazos de todo mundo.

## ⚠️ Um caso de fronteira, a confirmar

O prazo do perito não é compromisso, mas a **entrega do laudo é o gatilho** de um
prazo que é nosso — manifestar sobre a perícia. Ou seja: não interessa *quando o
perito tem que entregar*, mas interessa *quando ele entregou*.

Se o sistema ignorar o evento por completo, o prazo de manifestação só aparece
quando a intimação chegar pelo DJEN — o que provavelmente basta, já que a
intimação é o próprio termo inicial. **Confirmar com ela:** a manifestação sobre
o laudo é sempre intimada, ou às vezes é preciso acompanhar a juntada?

---

# 🟡 LACUNA 4 — Prazo com termo inicial em evento futuro

Não previsto na v2. Várias atas trazem prazos que não podem ser calculados no
momento da extração:

- *"custas recolhidas até 30 dias após o pagamento da última parcela"*
- *"honorários periciais... no prazo de 30 dias após a última parcela"*
- *"10 dias para o depósito"* (a contar de quando?)

*(O "50 dias para a entrega do laudo" saiu desta lista — é prazo do perito, fora
de escopo pela seção anterior. O mecanismo continua necessário para os de cima,
que são obrigações do cliente.)*

**Correção necessária:** um tipo `prazo_condicional`, que guarda
`{evento_gatilho, quantidade, unidade}` **sem data final**, e só vira prazo com
data quando o gatilho for confirmado por um humano. No painel aparece como
"aguardando evento", nunca como data.

## O que as telas mostraram — e por que não usamos aquele exemplo

Nas telas apareceu a linha da perita (processo 0900001, ciência 13/07/2026, fim
24/09/2026), que seria a ilustração perfeita do ciclo: prazo sem data na ata →
gatilho ocorre → prazo ganha data.

**Mas é prazo do perito, e portanto fora de escopo.** Fica aqui só como
demonstração de que o PJe resolve esses prazos do mesmo jeito — não como caso a
implementar.

Uma observação da tela que **vale para tudo**: o PJe deixou a coluna `Prazo` em
**0** e ainda assim preencheu o `Fim do Prazo`. A coluna de quantidade não é
confiável como fonte — mesma armadilha do campo `count` do DJEN (S2.1).

Os prazos condicionais que **interessam** são os do cliente: custas e honorários
periciais "30 dias após a última parcela". Esses continuam sem exemplo resolvido.

---

# 🔴 Canal fora da cobertura: Domicílio Eletrônico com ciência automática

Descoberto nas telas de 09/08/2026, e é mais amplo do que se supunha. Na tela do
processo 0000012-13:

| Documento | Meio | Criação | Ciência | Confirmado por | Prazo | Fim |
|---|---|---|---|---|---|---|
| Notificação | Domicílio Eletrônico | 10/04/2026 | 13/04/2026 | Ciente via Domicílio Eletrônico | 0 | — |
| Intimação | Domicílio Eletrônico | 09/04/2026 | **22/04/2026** | **Ciência Automática** | 5 | 29/04/2026 |

Duas coisas que a v2 não previa:

1. **O Domicílio não carrega só a primeira citação.** Carrega **intimação com
   prazo real** — ali, 5 dias vencendo em 29/04.
2. **A ciência pode ser automática.** Criação em 09/04, ciência em 22/04 — 13
   dias corridos depois, **sem ninguém abrir**. O prazo correu a partir de uma
   ciência que ocorreu por decurso.

**Consequência:** existe uma classe de prazo que nasce num canal que o sistema
não vê, com data-base que ninguém digitou. A declaração de cobertura tem de dizer
isso literalmente, e não pode ser nota de rodapé.

---

# Restrição: a tela do PJe não pode ser automatizada

A tela "Expediente(s) do processo" é a melhor fonte de conferência que existe — e
está atrás do login do PJe. A Parte 5 do plano é categórica: **nunca automatizar
login no PJe, nunca usar o certificado dela, nunca dar ciência em expediente.**
Abrir essa tela por robô é exatamente o risco de ciência automática que o projeto
inteiro existe para evitar.

Ela serve como **fonte manual de gabarito e conferência**, jamais como fonte de
dados do sistema. Isso não a diminui: é o padrão-ouro contra o qual o motor se
mede, produzido por quem tem autoridade sobre a contagem.

---

# Estado do Portão 1

**Fechado.** `APROVADO_PELA_ADVOGADA = false`.

| Item | Estado |
|---|---|
| Divergência 1 — recesso × suspensão | ✅ Resolvida |
| Divergência 2 — publicação × disponibilização | ✅ **Resolvida com dado real** (4 pares API × tela) |
| Ambiguidade 1 — os "5 dias" | ✅ Resolvida por desenho (não entram no motor) |
| Ambiguidade 2 — início em dia não útil | ✅ Resolvida · ✅ `dias_corridos` corrigido |
| Escopo — de quem é o prazo | ✅ Decidido (só escritório + cliente) |
| Lacuna 3 — calendários | 🟡 6 tribunais definidos; 3 datas a conferir; nenhuma carregada |
| Lacuna 4 — prazo condicional | 🟡 Modelagem pendente (custas/honorários do cliente) |
| **10 casos de referência** | 🔴 Faltam — mas ver nota abaixo |

## Nota de prioridade (09/08/2026, decisão do Luigi)

*"Os 10 casos: não se atenha muito neles — os prazos ela vai sempre olhar no
sistema."*

O que isso muda: o motor de prazos **permanece provisório por tempo
indeterminado**, e está tudo bem — ele é a segunda dupla de olhos (v2 §1.3-k),
nunca a fonte da verdade; ela confere no PJe. Todo resultado continua saindo com
`requerConfirmacao` e memória de cálculo.

O que isso NÃO muda: a chave `APROVADO_PELA_ADVOGADA` **só vira com o gabarito**.
Sem os 10 casos, ela fica `false` para sempre — e o produto funciona assim mesmo,
porque a prioridade dele (ver abaixo) usa datas **lidas**, não calculadas.

## Prioridade do produto (09/08/2026, decisão do Luigi)

*"O mais importante: avisar os clientes sobre os dados das atas, ler as datas
das audiências etc. e colocar na Google Agenda. É isso que eu quero."*

O centro do produto é o **briefing matinal** (ver `PRODUTO.md` na raiz):
audiências vão para a Google Agenda (única coisa que vai), prazos e vencimentos
das atas vivem **no briefing**, ressurgindo conforme se aproximam, e aviso a
cliente sai **sob demanda dela**, com o e-mail exibido antes de ir. As datas
envolvidas são **lidas do documento, não calculadas** — o achado §6.3 do
relatório S4 já apontava que boa parte dos prazos vem com data explícita.

O cálculo de prazo vira camada de apoio: proposta marcada "CONFIRMAR", nunca
bloqueio do fluxo principal. Aviso a cliente é **e-mail externo** e permanece,
para sempre, atrás de aprovação explícita (Parte 5 do plano).

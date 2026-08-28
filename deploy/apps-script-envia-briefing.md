# Auto-envio do briefing — Google Apps Script (ponte até a Fase 2)

**Problema:** o conector do Gmail (o oficial do Google, usado pela rotina e pelo
Claude) **não tem ferramenta de envio** — só cria rascunho. Confirmado no teste
de 10/08/2026.

**Solução-ponte:** um script de 15 linhas rodando **dentro da própria conta
Google** do escritório, que todo dia útil, às ~7h20, procura o rascunho do
briefing do dia e o envia. Nenhuma senha sai da conta; nada externo tem acesso;
o Google executa sozinho.

## Instalação (uma vez, ~3 minutos, pelo Luigi)

1. Logado como escritorio@exemplo.com, abra **script.google.com** → *Novo projeto*.
2. Apague o conteúdo e cole o código abaixo. Salve (nome: `envia-briefing`).
3. Menu esquerdo → **Acionadores** (relógio) → *Adicionar acionador*:
   - Função: `enviarBriefingDoDia`
   - Origem do evento: *Baseado no tempo* → *Timer diário* → **7h às 8h**
4. Autorize quando o Google pedir (a permissão fica na própria conta).

## O código

```javascript
function enviarBriefingDoDia() {
  // Envia SOMENTE o rascunho cujo assunto contém "Briefing" E a data de HOJE
  // por extenso (dd/MM/aaaa). Qualquer outro rascunho é ignorado.
  const hoje = Utilities.formatDate(new Date(), "America/Sao_Paulo", "dd/MM/yyyy");
  const rascunhos = GmailApp.getDrafts();
  for (const rascunho of rascunhos) {
    const assunto = rascunho.getMessage().getSubject() || "";
    if (assunto.indexOf("Briefing") !== -1 && assunto.indexOf(hoje) !== -1) {
      rascunho.send();
    }
  }
}
```

## Regras de segurança embutidas

- Só envia rascunho com **"Briefing" + a data completa de hoje** no assunto — o
  assunto padronizado da rotina é `☕ Briefing — DD/MM/AAAA`. Rascunhos de aviso
  a cliente, prévias e qualquer outra coisa **nunca** são tocados.
- Consequência: **nenhum outro rascunho pode usar esse padrão de assunto** —
  regra registrada no PRODUTO.md.
- Para desligar: script.google.com → Acionadores → excluir. Reversível em 10s.

## Linha do tempo resultante (dias úteis)

~7h00 rotina monta o briefing e deixa o rascunho → ~7h20 o script envia →
7h30 o briefing está na caixa de entrada, sem ninguém tocar em nada.

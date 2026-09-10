## O que muda e por quê

<!-- Uma ou duas frases. O "porquê" vale mais que o "o quê": o diff já mostra o quê. -->

## Como foi verificado

<!-- Comandos rodados e resultado. A CI roda tudo isto; aqui é o que você viu localmente. -->

```
npm test
npm run lint
npm run auditoria:vazamento
```

## Checklist

- [ ] **Nenhum dado real** entrou: nomes, e-mails, OABs e números de processo são fictícios (CNJ com DV inválido; e-mail em `exemplo.com`; OAB 10000–10099).
- [ ] Nenhum **invariante** foi relaxado (auditoria append-only · idempotência antes da chamada externa · erro nunca vira fim de lista · prazo não é adivinhado · segredo fora do disco · log sem teor) — ou o PR explica por quê e tem teste.
- [ ] Nenhuma **dependência npm** foi adicionada (ADR 0001).
- [ ] `APROVADO_PELA_ADVOGADA` continua `false` (ADR 0004).
- [ ] Testes novos são **herméticos**: sem rede, sem `dados/`, sem Keychain.
- [ ] Se a contagem de testes mudou, o README foi atualizado (badge, tabela Stack, bloco Rodar) — a CI confere.
- [ ] Se uma decisão de arquitetura mudou, há um ADR novo em `docs/adr/`.

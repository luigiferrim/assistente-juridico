# Contribuindo

Este repositório é o código de um sistema **em produção num escritório real**,
publicado para leitura e estudo. Issues e pull requests pequenos são bem-vindos.
O que não se negocia está em "O que o projeto deliberadamente NÃO faz".

## Rodar do zero

Pré-requisitos: **Node.js ≥ 22** (traz `node:sqlite` e `node:test`) e git.
Python 3 só para os spikes da Fase 0. Não há `npm install`: o projeto tem zero
dependências, e a CI confere que o lockfile continua vazio.

```bash
git clone https://github.com/luigiferrim/assistente-juridico.git
cd assistente-juridico
npm test                     # 102 testes herméticos: sem rede, sem dado real, sem estado da máquina
npm run test:tudo            # + 29 dos spikes em Node = 131
npm run lint                 # sintaxe, ESM e regras do projeto — só com o Node
npm run test:cobertura       # cobertura nativa do node:test → cobertura/resumo.md
npm run auditoria:vazamento  # árvore + histórico: nenhum dado real pode estar aqui
```

Tudo isso roda sem configurar nada — e é exatamente o que a CI roda a cada push
e pull request ([ci.yml](.github/workflows/ci.yml)). Para ver o sistema por
dentro sem dado real: `npm run briefing` gera um briefing com o escritório
fictício em `dados/briefings/`.

## O que precisa ser configurado para OPERAR (não para desenvolver)

O código versionado só conhece um escritório fictício ("Escritório Exemplo",
OABs 10001–10003/SC). Para rodar de verdade num escritório:

| O quê | Onde | Observação |
|---|---|---|
| Identidade do escritório (advogados, OAB, cores), contatos de clientes, URL e token do App da Web | `dados/config.json` — **fora do git** | formato documentado em [escritorio.mjs](src/core/escritorio.mjs); `ASSISTENTE_CONFIG` aponta para outro caminho |
| Banco SQLite | `dados/assistente.db`, criado na primeira execução | `ASSISTENTE_DB` muda o caminho; as migrações de [src/core/migrations](src/core/migrations) aplicam sozinhas |
| Segredos (refresh token do Google, chave de API) | Keychain do macOS, via [segredos.mjs](src/core/segredos.mjs) | nunca `.env` — o lint acusa |
| Apps Script do escritório (envio do briefing, vigia, botão Aprovar) | conta Google do escritório | passo a passo em [deploy/apps-script-escritorio.md](deploy/apps-script-escritorio.md) |
| Coleta diária | launchd (macOS) | [deploy/bloco3-coleta-local.md](deploy/bloco3-coleta-local.md); o DJEN bloqueia IP de datacenter, por isso roda local |

Sem `dados/config.json` o sistema funciona com o exemplo fictício. É assim que a
suíte e a CI rodam.

## O que o projeto deliberadamente NÃO faz

- **Não executa ação externa sem aprovação humana.** Evento na agenda e e-mail a
  cliente passam por um clique da advogada; o aviso ao cliente nasce sempre como
  rascunho. [ADR 0006](docs/adr/0006-aprovacao-humana-para-toda-acao-externa.md)
- **Não faz login no PJe/eproc**, não usa certificado digital, não dá ciência de
  expediente. A tela do tribunal é gabarito manual, jamais automação.
- **Não calcula prazo como verdade.** O motor existe, marca `requerConfirmacao`
  e fica fechado (`APROVADO_PELA_ADVOGADA = false`).
  [ADR 0004](docs/adr/0004-motor-de-prazos-nao-aprovado.md)
- **Não usa o DataJud para monitorar.**
  [ADR 0002](docs/adr/0002-descarte-do-datajud.md)
- **Não usa IA no pipeline determinístico** (`src/`): a triagem é por regra
  explícita, e cada cartão diz quais sinais o classificaram.
- **Não adiciona dependência npm** — nem de runtime nem de ferramenta.
  [ADR 0001](docs/adr/0001-zero-dependencias-npm.md)
- **Não monitora uma OAB descoberta nos dados** sem consentimento de quem a detém.
  [ADR 0005](docs/adr/0005-nao-monitorar-a-segunda-oab.md)
- **Não guarda dado de cliente fora do Mac do escritório.** Nada na nuvem, nada
  no git.

## Regras para mudanças

1. **Nenhum dado real.** Nomes, e-mails, OABs e números de processo em código,
   testes e documentação são fictícios. Convenções que a auditoria conhece:
   e-mails em `exemplo.com`, `exemplo-cliente.com` ou `escritorio.com.br`; OAB
   entre 10000 e 10099 (99999 é o sentinela "fora do cadastro"); CNJ sintético
   com **dígito verificador inválido** de propósito — a auditoria acusa qualquer
   CNJ que feche a conta.
2. **Invariantes não relaxam**: auditoria append-only; reserva de idempotência
   antes da chamada externa; erro nunca vira fim de lista; prazo não é adivinhado;
   segredo fora do disco; log sem teor. Um PR que toque nisso precisa de teste e
   de justificativa — e o lint barra as formas mais óbvias.
3. **Teste hermético.** Sem rede, sem `dados/`, sem Keychain: injete a função.
4. **O README é conferido pela CI.** Ao adicionar teste, atualize o badge, a
   linha da tabela Stack e os comentários do bloco "Rodar" — senão o build quebra,
   de propósito.
5. **Commits em português**, descrevendo o porquê, não só o quê.

Achou dado real ou falha de sigilo no repositório? **Não abra issue pública com o
dado.** Fale com o autor pelo perfil do GitHub.

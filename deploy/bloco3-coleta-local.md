# Bloco 3 — coleta local diária + entrega reserva

Instalado em 12/08/2026. Motivo: a rede da nuvem bloqueia o DJEN em definitivo
(testado 10 e 12/08 — WebFetch e curl). A rotina da nuvem continua dona do
briefing das 7h (ela enxerga Gmail + Agenda); o **Mac local vira a fonte da
verdade do Diário**: banco atualizado todo dia útil, briefing determinístico
arquivado, e um canal de entrega reserva para quando a nuvem falhar.

## O que roda sozinho

`launchd` (agente do usuário, sem sudo): dias úteis às **07:45**, roda

    node src/scripts/gerar-briefing.mjs --coletar --marcar

- coleta DJEN das 3 OABs (janela de 3 dias — perder um dia não perde item);
- gera `dados/briefings/AAAA-MM-DD-local.html` e marca os itens como
  relatados (ciclo de vida do banco é do local);
- log em `dados/logs/coleta.log`; saída 1 se alguma fonte falhou.
- Se o Mac estiver dormindo às 07:45, o launchd roda ao acordar (não perde o
  dia; só atrasa). Mac desligado = sem coleta — a janela de 3 dias recupera.

Arquivo: `~/Library/LaunchAgents/br.adv.assistente.coleta.plist`

| Ação | Comando |
|---|---|
| conferir se está ativo | `launchctl print gui/$(id -u)/br.adv.assistente.coleta \| head` |
| rodar agora (teste) | `launchctl kickstart gui/$(id -u)/br.adv.assistente.coleta` |
| desligar | `launchctl bootout gui/$(id -u)/br.adv.assistente.coleta` |
| religar | `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/br.adv.assistente.coleta.plist` |
| ver o log | `tail -40 dados/logs/coleta.log` |

## Entrega reserva (quando a rotina da nuvem falhar)

Se o alarme das 8h disparar ("o briefing NÃO chegou") e o rascunho não estiver
na caixa, **um comando** entrega o briefing local por e-mail:

    npm run briefing:entregar

Ele coleta, gera, marca e envia o HTML para a caixa do escritório via o App da
Web (`acao=entregar`, protegido pelo token do `dados/config.json`). Assunto no
padrão `☕ Briefing — DD/MM/AAAA` (UTF-8 testado ✓). Falha em voz alta se o
token for recusado — nunca finge que entregou.

## Limites declarados

O briefing local NÃO vê Gmail nem Agenda (sem credencial, por desenho): não
integra e-mails do dia, não confere "já está na agenda" e não sabe de
cancelamentos avisados por e-mail. É a rede de segurança do Diário, não o
substituto da rotina. O rodapé dele declara isso.

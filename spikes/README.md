# Spikes — Fase 0 (Discovery)

Código **descartável**. Nada aqui vira produção. Cada spike responde uma pergunta e gera um relatório em `relatorios/`.

Regras da Fase 0:
- Somente leitura. Nenhuma credencial real de Gmail/Calendar/PJe.
- Nenhum acesso autenticado ao PJe. Nenhum uso de certificado digital.
- Toda afirmação jurídica precisa de fonte explícita.
- Inconsistência entre o plano e a realidade → parar e reportar, não contornar.

## Status

| Spike | Pergunta | Status | Veredicto |
|---|---|---|---|
| S1 | O DJEN traz as comunicações dela? | 🟢 Concluído | ✅ Confirma a v2 — e resolve o problema dos múltiplos estados |
| S2 | Limites, paginação e histórico do DJEN | 🟡 Parcial | 🔴 3 achados contrariam a v2; correção implementada e testada |
| S6 | DataJud cobre os processos dela? | 🟢 Concluído | 🔴 Atraso mediano de 42 dias — não serve para monitorar |
| **S5** | **Os PDFs do PJe têm camada de texto?** | 🟢 **Concluído 09/08** | ✅ 10/10 com texto · 🔴 mas a extração ingênua reprova 97% das citações corretas |
| S3 | Qual a taxa de falso negativo vs. realidade? | 🔴 Bloqueado | Depende dela — **é o portão decisivo** |
| S4 | A IA extrai corretamente das atas dela? | 🔴 Bloqueado | Atas em disco; falta rodar a extração e montar o gabarito |
| S7 | MNI é autorizado para advogado? | 🔴 Bloqueado | Ofício ao TRT12 — ação humana |
| **S8** | **Calendário de prazos confere?** | 🟡 **Parcial 09/08** | ✅ regra de contagem confere com o PJe · 🔴 3 datas faltam no calendário · faltam os 10 casos |

**O Portão 0 continua fechado.** O S5 sair do bloqueio não o abre: ele depende do
S3 (cobertura), do S4 (extração) e do S7 (MNI). Ver `../coleta/`.

**O Portão 1 continua fechado.** O S8 parcial confirma que o motor reproduz a
conta do *tribunal*; o Portão 1 exige que reproduza a conta **dela**, e isso são
os 10 casos de referência.

## Ambiente

Instalado em 09/08/2026: **Homebrew 6.0.15 · Node v26.7.0 · npm 11.19.0**
(`~/.zprofile` carrega o `brew shellenv`). Python 3.9.6 do sistema também
disponível.

A regra crítica de paginação existe em **duas implementações equivalentes**:
`lib/djen.py` (usada pelos spikes) e `lib/djen.mjs` (referência para a Fase 1,
em Node). Ambas têm a mesma suíte e ambas passaram no teste de mutação.

O extrator de PDF do S5 (`lib/pdf_texto.mjs`) é **descartável e não é o de
produção** — existe para medir o problema com os arquivos reais, não para
resolvê-lo. A Fase 3 precisa de biblioteca madura; ver §8 do relatório S5.

## Como rodar

```bash
# Regra crítica de paginação — Python
python3 -m unittest discover -s spikes/lib -t spikes/lib -v

# Regra crítica de paginação — Node
node --test spikes/lib/djen.test.mjs

# S5 — camada de texto e verificação de citação (offline, sobre as 10 atas)
node spikes/s5_camada_texto.mjs
node --test spikes/lib/pdf_texto.test.mjs

# S6 — DataJud vs DJEN (requisições read-only)
python3 spikes/s6_datajud.py

# S2 — rate limit (para no primeiro 429; só rodar quando necessário)
python3 spikes/s2_rate_limit.py
```

## Limites operacionais conhecidos (DJEN)

| Limite | Valor medido | Consequência no código |
|---|---|---|
| Rate limit | ~20 req/min (429 na 21ª) | `pausa_s = 2.0` entre páginas |
| Recuperação do 429 | ~51 s | `backoff_s = 60` — **acima** da janela, de propósito |
| Página mínima | 5 itens | pedir menos não adianta |
| Fim da lista | HTTP 500 enganoso | erro **nunca** encerra paginação |
| `count` | não confiável | nunca usado em lógica de controle |
| Histórico | começa em ~2025 | backfill antigo só via DataJud |

## Estrutura

```
spikes/
├── lib/
│   ├── djen.py            # cliente DJEN + regra de terminação segura
│   ├── djen.mjs           # mesma lógica em JS — referência para a Fase 1
│   ├── test_djen.py       # 7 testes; 2 marcados CRITICO
│   ├── djen.test.mjs      # 7 testes
│   ├── pdf_texto.mjs      # S5 — extração com CMap + verificação de citação
│   └── pdf_texto.test.mjs # 22 testes
├── s2_rate_limit.py
├── s5_camada_texto.mjs
├── s6_datajud.py
└── relatorios/
    ├── S1-djen-oab.md
    ├── S2-djen-limites.md
    ├── S4-S5-atas.md      # inventário de fatos (S4); a parte S5 migrou
    ├── S5-camada-texto.md
    ├── S6-datajud.md
    └── S8-parcial-prazos-pje.md
```

"""
Cliente DJEN (API Comunica / CNJ) — SPIKE (Python 3.9 stdlib, zero dependências).

Porte fiel de `djen.mjs`. Existe porque a máquina do escritório ainda não tem
Node instalado; a versão .mjs é a implementação de referência para a Fase 1.

REGRA DE SEGURANÇA CENTRAL (achados S2.1 e S2.2, aprovados em 08/08/2026):

    A paginação termina SOMENTE quando uma página retorna MENOS itens do que
    o solicitado. Qualquer erro (HTTP 500, timeout, JSON inválido, status
    "error") é FALHA — nunca fim de lista.

Motivo: a API devolve HTTP 500 com "O sistema está muito ocupado" tanto ao
passar do fim da lista quanto sob carga real. Tratar erro como fim faria o
sistema concluir "não há mais nada" quando faltaram páginas — perder uma
intimação em silêncio. É o pior modo de falha do projeto.

O campo `count` NÃO é total confiável (S2.1: 100 / 200 / 10000 / 45062 para a
mesma consulta, conforme o tamanho de página). É informativo e nunca entra em
lógica de controle.
"""

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import namedtuple

BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"
USER_AGENT = "assistente-juridico-spike/0.1 (leitura)"

# Tamanho mínimo real de página: pedir 1 ou 2 devolve 5 (S2.4).
PAGINA_MINIMA = 5

# `completo` é obrigatório de checar: False significa que a coleta NÃO cobriu
# o período e a fonte deve ser marcada como "falhou" no painel.
Coleta = namedtuple("Coleta", "itens completo motivo paginas_lidas")


class DjenError(Exception):
    def __init__(self, mensagem, pagina=None):
        super().__init__(mensagem)
        self.pagina = pagina


def buscar_pagina(filtros, pagina, itens_por_pagina, timeout=30):
    """Busca UMA página. Levanta DjenError em qualquer falha —
    jamais devolve lista vazia por erro."""
    params = dict(filtros)
    params["pagina"] = str(pagina)
    params["itensPorPagina"] = str(itens_por_pagina)
    url = BASE + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            bruto = resp.read()
    except urllib.error.HTTPError as e:
        raise DjenError("HTTP %s na pagina %s" % (e.code, pagina), pagina)
    except Exception as e:
        raise DjenError("falha de rede na pagina %s: %s" % (pagina, e), pagina)

    try:
        corpo = json.loads(bruto)
    except Exception as e:
        raise DjenError("JSON invalido na pagina %s: %s" % (pagina, e), pagina)

    if corpo.get("status") != "success":
        raise DjenError(
            'status "%s" na pagina %s: %s'
            % (corpo.get("status"), pagina, corpo.get("message", "sem mensagem")),
            pagina,
        )
    itens = corpo.get("items")
    return itens if isinstance(itens, list) else []


def buscar_tudo(
    filtros,
    itens_por_pagina=100,
    max_paginas=100,
    pausa_s=2.0,
    tentativas_por_pagina=3,
    backoff_s=60.0,
    buscar=buscar_pagina,
    dormir=time.sleep,
):
    """Rate limit medido em 09/08/2026: ~20 requisições/minuto, recuperação em ~51s.

    Por isso `backoff_s=60` — MAIOR que a janela de recuperação. Um backoff
    curto faria as 3 tentativas se esgotarem dentro do próprio bloqueio,
    transformando um 429 transitório em coleta incompleta sem necessidade.
    """
    """Busca TODAS as páginas. Nunca levanta exceção; sempre devolve uma
    Coleta com `completo` explícito. Nunca devolve resultado parcial
    disfarçado de completo."""
    itens = []
    for pagina in range(1, max_paginas + 1):
        lote = None
        ultimo_erro = None
        for tentativa in range(1, tentativas_por_pagina + 1):
            try:
                lote = buscar(filtros, pagina, itens_por_pagina)
                break
            except DjenError as e:
                ultimo_erro = e
                if tentativa < tentativas_por_pagina:
                    # Backoff acima da janela de recuperacao do rate limit (~51s).
                    dormir(backoff_s * tentativa)

        # ERRO != FIM DE LISTA. Coleta incompleta, declarada como tal.
        if lote is None:
            return Coleta(
                itens,
                False,
                "falha na pagina %s apos %s tentativas: %s"
                % (pagina, tentativas_por_pagina, ultimo_erro),
                pagina - 1,
            )

        itens.extend(lote)

        # ÚNICA condição válida de término: página incompleta.
        if len(lote) < itens_por_pagina:
            return Coleta(itens, True, "pagina incompleta = fim da lista", pagina)

        if pagina < max_paginas:
            dormir(pausa_s)

    # Estourou o teto sem página incompleta: pode haver mais. NÃO é completo.
    return Coleta(
        itens,
        False,
        "atingido o teto de %s paginas sem pagina incompleta - pode haver mais"
        % max_paginas,
        max_paginas,
    )


def filtro_por_oab(numero_oab, uf_oab, data_inicio, data_fim):
    """Omitir `siglaTribunal` cobre TODOS os tribunais (confirmado no S1)."""
    return {
        "numeroOab": str(numero_oab),
        "ufOab": str(uf_oab).upper(),
        "dataDisponibilizacaoInicio": data_inicio,
        "dataDisponibilizacaoFim": data_fim,
    }

"""
S6 — O DataJud cobre os processos dela? Com que atraso em relação ao DJEN?

Somente leitura. Usa a chave pública do CNJ (publicada em
https://datajud-wiki.cnj.jus.br/api-publica/acesso/).

Entrada: processos reais descobertos pelo S1 (via DJEN), não uma lista chutada.
Saída: cobertura, atraso DataJud x DJEN, presença de nivelSigilo.
"""

import json
import sys
import time
import urllib.request
from collections import Counter
from datetime import datetime

sys.path.insert(0, __file__.rsplit("/", 1)[0] + "/lib")
from djen import buscar_tudo, filtro_por_oab  # noqa: E402

CHAVE_PUBLICA_CNJ = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
DATAJUD = "https://api-publica.datajud.cnj.jus.br/api_publica_%s/_search"


def consultar_datajud(sigla_tribunal, numero_processo, timeout=30):
    """Busca um processo pelo número no índice do tribunal. Somente leitura."""
    corpo = json.dumps(
        {"size": 1, "query": {"match": {"numeroProcesso": numero_processo}}}
    ).encode()
    req = urllib.request.Request(
        DATAJUD % sigla_tribunal.lower(),
        data=corpo,
        headers={
            "Authorization": "APIKey " + CHAVE_PUBLICA_CNJ,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        d = json.load(r)
    hits = d.get("hits", {}).get("hits", [])
    return hits[0]["_source"] if hits else None


def main():
    oab, uf = "10001", "SC"  # substituir pela OAB real ao rodar
    print("== S6 — DataJud vs DJEN ==\n")

    print("1) Coletando processos reais via DJEN (últimos 31 dias)...")
    coleta = buscar_tudo(filtro_por_oab(oab, uf, "2026-07-09", "2026-08-08"))
    if not coleta.completo:
        print("   !! coleta DJEN INCOMPLETA (%s) — abortando." % coleta.motivo)
        return 1
    print("   %d comunicações, %d páginas\n" % (len(coleta.itens), coleta.paginas_lidas))

    # Um processo por (tribunal, número), priorizando os mais recentes.
    vistos, amostra = set(), []
    for c in sorted(coleta.itens, key=lambda i: i["data_disponibilizacao"], reverse=True):
        chave = (c["siglaTribunal"], c["numero_processo"])
        if chave in vistos:
            continue
        vistos.add(chave)
        amostra.append(c)
        if len(amostra) >= 12:
            break

    print("2) Consultando o DataJud para %d processos...\n" % len(amostra))
    achados, faltantes, erros = [], [], []
    for c in amostra:
        trib, num = c["siglaTribunal"], c["numero_processo"]
        try:
            proc = consultar_datajud(trib, num)
        except Exception as e:
            erros.append((trib, num, str(e)[:60]))
            print("   %-6s %s  ERRO: %s" % (trib, c["numeroprocessocommascara"], str(e)[:50]))
            time.sleep(1)
            continue

        if proc is None:
            faltantes.append((trib, num))
            print("   %-6s %s  NAO ENCONTRADO" % (trib, c["numeroprocessocommascara"]))
        else:
            movs = proc.get("movimentos") or []
            ult = max((m["dataHora"] for m in movs), default=None)
            atraso = None
            if ult:
                d_djen = datetime.strptime(c["data_disponibilizacao"], "%Y-%m-%d")
                d_dj = datetime.strptime(ult[:10], "%Y-%m-%d")
                atraso = (d_djen - d_dj).days
            achados.append(
                {
                    "tribunal": trib,
                    "sigilo": proc.get("nivelSigilo"),
                    "movs": len(movs),
                    "ultimo_mov": ult[:10] if ult else None,
                    "djen": c["data_disponibilizacao"],
                    "atraso_dias": atraso,
                }
            )
            print(
                "   %-6s %s  movs=%-4d ultimo=%s  djen=%s  atraso=%s d  sigilo=%s"
                % (
                    trib,
                    c["numeroprocessocommascara"],
                    len(movs),
                    ult[:10] if ult else "-",
                    c["data_disponibilizacao"],
                    atraso if atraso is not None else "?",
                    proc.get("nivelSigilo"),
                )
            )
        time.sleep(1)

    print("\n== RESUMO ==")
    print("encontrados : %d/%d" % (len(achados), len(amostra)))
    print("nao achados : %d  %s" % (len(faltantes), [t for t, _ in faltantes]))
    print("erros       : %d" % len(erros))
    if achados:
        atrasos = [a["atraso_dias"] for a in achados if a["atraso_dias"] is not None]
        if atrasos:
            atrasos.sort()
            print(
                "atraso (DJEN - ultimo mov DataJud): min=%d mediana=%d max=%d dias"
                % (atrasos[0], atrasos[len(atrasos) // 2], atrasos[-1])
            )
        print("niveis de sigilo:", dict(Counter(a["sigilo"] for a in achados)))
    return 0


if __name__ == "__main__":
    sys.exit(main())

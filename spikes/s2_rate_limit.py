"""
S2 (complemento) — Rate limit do DJEN.

Autorizado pelo Luigi em 08/08/2026. Carga deliberadamente pequena: 30
requisições sequenciais, sem paralelismo. O objetivo é achar a janela segura
de coleta diária, não estressar um serviço público.

Se aparecer 429 ou degradação clara, o teste PARA imediatamente.
"""

import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"
UA = "assistente-juridico-spike/0.1 (leitura; medicao de limite autorizada)"
TOTAL = 30


def uma(i):
    """Uma requisição barata. Retorna (codigo, segundos)."""
    q = urllib.parse.urlencode(
        {
            "siglaTribunal": "TRT12",
            "dataDisponibilizacaoInicio": "2026-08-06",
            "dataDisponibilizacaoFim": "2026-08-06",
            "itensPorPagina": "5",
            "pagina": str((i % 3) + 1),  # varia p/ nao bater so em cache
        }
    )
    req = urllib.request.Request(BASE + "?" + q, headers={"User-Agent": UA})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
            return r.status, time.time() - t0
    except urllib.error.HTTPError as e:
        return e.code, time.time() - t0
    except Exception:
        return 0, time.time() - t0


def main():
    print("== S2 complemento — rate limit ==")
    print("%d requisicoes sequenciais, sem pausa. Para no primeiro 429.\n" % TOTAL)

    tempos, codigos = [], []
    for i in range(1, TOTAL + 1):
        cod, dt = uma(i)
        tempos.append(dt)
        codigos.append(cod)
        marca = "" if cod == 200 else "   <-- ATENCAO"
        print("  %2d/%d  HTTP %-3s  %5.2fs%s" % (i, TOTAL, cod, dt, marca))
        if cod == 429:
            print("\n>>> 429 recebido na requisicao %d. PARANDO." % i)
            break
        if cod == 0:
            print("\n>>> falha de rede na requisicao %d. PARANDO." % i)
            break

    ok = [t for t, c in zip(tempos, codigos) if c == 200]
    print("\n== RESUMO ==")
    print("requisicoes  : %d" % len(codigos))
    print("HTTP 200     : %d" % codigos.count(200))
    print("HTTP 429     : %d" % codigos.count(429))
    print("HTTP 500     : %d" % codigos.count(500))
    if ok:
        ok_ord = sorted(ok)
        print(
            "latencia 200 : min=%.2fs mediana=%.2fs max=%.2fs"
            % (ok_ord[0], ok_ord[len(ok_ord) // 2], ok_ord[-1])
        )
        # Degradacao = ultimo terco muito mais lento que o primeiro
        n = max(1, len(ok) // 3)
        ini, fim = sum(ok[:n]) / n, sum(ok[-n:]) / n
        print("degradacao   : inicio=%.2fs  fim=%.2fs  (%+.0f%%)" % (ini, fim, (fim / ini - 1) * 100))
    return 0


if __name__ == "__main__":
    sys.exit(main())

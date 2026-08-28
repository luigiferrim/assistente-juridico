"""
Testes da regra de terminação da paginação do DJEN.

Esta suíte existe por um motivo único: garantir que um erro da API NUNCA seja
confundido com fim da lista. Se ela ficar verde enquanto a implementação trata
erro como fim, alguém perde um prazo.

Rodar:  python3 -m unittest discover -s spikes/lib -v
"""

import unittest

from djen import Coleta, DjenError, buscar_tudo


def pagina(n):
    return [{"id": i, "texto": "..."} for i in range(n)]


def sem_pausa(_s):
    pass


class TestTerminacaoPaginacao(unittest.TestCase):
    def test_pagina_incompleta_encerra_como_completo(self):
        def buscar(_f, p, _n):
            return pagina(100) if p == 1 else pagina(20)

        r = buscar_tudo({}, buscar=buscar, dormir=sem_pausa, itens_por_pagina=100)
        self.assertTrue(r.completo)
        self.assertEqual(len(r.itens), 120)
        self.assertEqual(r.paginas_lidas, 2)

    def test_pagina_cheia_seguida_de_vazia_encerra_como_completo(self):
        def buscar(_f, p, _n):
            return pagina(100) if p == 1 else []

        r = buscar_tudo({}, buscar=buscar, dormir=sem_pausa, itens_por_pagina=100)
        self.assertTrue(r.completo)
        self.assertEqual(len(r.itens), 100)

    def test_CRITICO_erro_no_meio_nao_pode_virar_fim_de_lista(self):
        """Cenário real: HTTP 500 'O sistema está muito ocupado' na página 3."""

        def buscar(_f, p, _n):
            if p <= 2:
                return pagina(100)
            raise DjenError("HTTP 500 na pagina 3", p)

        r = buscar_tudo(
            {}, buscar=buscar, dormir=sem_pausa, itens_por_pagina=100, tentativas_por_pagina=3
        )
        self.assertFalse(r.completo, "coleta com erro JAMAIS pode ser reportada como completa")
        self.assertEqual(len(r.itens), 200, "itens lidos preservados, porem marcados como parciais")
        self.assertIn("falha na pagina 3", r.motivo)

    def test_CRITICO_erro_na_primeira_pagina_nao_vira_nada_hoje(self):
        def buscar(_f, _p, _n):
            raise DjenError("HTTP 500")

        r = buscar_tudo({}, buscar=buscar, dormir=sem_pausa, tentativas_por_pagina=2)
        self.assertFalse(r.completo)
        self.assertEqual(len(r.itens), 0)
        # A distincao que importa: (0 itens, completo=False) != (0 itens, completo=True).
        # O painel deve dizer "a fonte falhou", nunca "nao ha nada hoje".

    def test_erro_transitorio_e_superado_pelo_retry(self):
        estado = {"falhas": 2}

        def buscar(_f, p, _n):
            if p == 2 and estado["falhas"] > 0:
                estado["falhas"] -= 1
                raise DjenError("500 transitorio")
            return pagina(100) if p == 1 else pagina(7)

        r = buscar_tudo(
            {}, buscar=buscar, dormir=sem_pausa, itens_por_pagina=100, tentativas_por_pagina=3
        )
        self.assertTrue(r.completo)
        self.assertEqual(len(r.itens), 107)

    def test_estourar_teto_de_paginas_nao_e_completo(self):
        def buscar(_f, _p, _n):
            return pagina(100)  # nunca acaba

        r = buscar_tudo({}, buscar=buscar, dormir=sem_pausa, itens_por_pagina=100, max_paginas=3)
        self.assertFalse(r.completo)
        self.assertIn("teto de 3 paginas", r.motivo)

    def test_campo_count_nao_influencia_terminacao(self):
        """count é mentiroso (S2.1); só o tamanho do lote decide."""

        def buscar(_f, p, _n):
            return pagina(100) if p == 1 else pagina(3)

        r = buscar_tudo({}, buscar=buscar, dormir=sem_pausa, itens_por_pagina=100)
        self.assertTrue(r.completo)
        self.assertEqual(len(r.itens), 103)


if __name__ == "__main__":
    unittest.main(verbosity=2)

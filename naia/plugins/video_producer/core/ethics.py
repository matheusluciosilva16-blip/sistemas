"""Checagem de publicidade da advocacia no texto falado e na tela.

Base: Código de Ética e Disciplina da OAB e Provimento CFOAB nº 205/2021.
É um filtro de palavras para pegar os erros óbvios antes da renderização,
não substitui a revisão humana do conteúdo.
"""

from __future__ import annotations

import re
import unicodedata

GUIDELINES = """\
Regras obrigatórias (publicidade da advocacia, Provimento CFOAB 205/2021):
- Conteúdo informativo e sóbrio. Nada de promessa, garantia ou insinuação de resultado.
- Proibido: percentual de êxito, número de causas ganhas, valores obtidos, depoimentos.
- Proibido: preço, honorários, desconto, "consulta grátis", promoção.
- Proibido: sensacionalismo, medo explorado de forma abusiva, comparação com outros advogados.
- Proibido: citar caso concreto identificável, prazo ou número de lei que você não tenha certeza.
- Prefira orientação geral ("procure um advogado de sua confiança", "reúna os documentos").
- CTA permitido: convite discreto para buscar orientação. Nunca "garanta", "resolva já", "ganhe".
"""

_PATTERNS = {
    "promessa de resultado": r"\b(garant\w*|resultado certo|causa ganha|vamos ganhar|voce vai ganhar|sem risco|100 ?%)",
    "percentual ou contagem de êxito": r"\b\d{1,3} ?% (de )?(exito|sucesso|aprovacao|clientes)|\bcasos (ganhos|vencidos)\b",
    "preço ou gratuidade": r"\b(gratis|gratuit\w*|de graca|desconto|promocao|r\$ ?\d)",
    "linguagem sensacionalista": r"\b(urgente!!|imperdivel|ultima chance|so hoje|corra)\b",
    "depoimento": r"\b(depoimento|meus clientes dizem|cliente satisfeito)\b",
}


def _norm(text: str) -> str:
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()


def violations(text: str) -> list[str]:
    low = _norm(text or "")
    return [label for label, pat in _PATTERNS.items() if re.search(pat, low)]

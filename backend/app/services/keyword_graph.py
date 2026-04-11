"""
Deterministic Keyword Graph Engine — NetworkX + PageRank.
No LLM involved. Builds a co-occurrence graph from keyword lists and content,
runs PageRank to surface the most strategically important terms.
"""
from __future__ import annotations

import re
from collections import Counter
from itertools import combinations
from typing import Any

import networkx as nx

_STOP = frozenset({
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "this", "that",
    "these", "those", "it", "its", "not", "no", "so", "if", "as", "we",
    "our", "you", "your", "they", "their", "he", "she", "his", "her",
    "about", "more", "also", "than", "just", "very", "all", "any", "each",
})


def _tokenise(text: str) -> list[str]:
    words = re.findall(r"[a-z]{3,}", text.lower())
    return [w for w in words if w not in _STOP]


def build_keyword_graph(
    *,
    seo_keywords: list[str],
    strategy_pillars: list[str],
    brand_text: str = "",
    window: int = 5,
) -> dict[str, Any]:
    """
    Returns a JSON-serialisable dict with:
      nodes: [{id, pagerank, degree, cluster}]
      edges: [{source, target, weight}]
      top_keywords: [{keyword, score}]  (top 20 by PageRank)
      clusters: [{id, keywords}]
    """
    all_text = " ".join(seo_keywords + strategy_pillars) + " " + brand_text
    tokens = _tokenise(all_text)

    # Co-occurrence within sliding window
    edge_weights: Counter = Counter()
    for i in range(len(tokens)):
        window_tokens = tokens[i : i + window]
        for a, b in combinations(set(window_tokens), 2):
            pair = tuple(sorted([a, b]))
            edge_weights[pair] += 1

    G = nx.Graph()
    for (a, b), w in edge_weights.items():
        G.add_edge(a, b, weight=w)

    if G.number_of_nodes() == 0:
        return {"nodes": [], "edges": [], "top_keywords": [], "clusters": []}

    pr = nx.pagerank(G, weight="weight")
    communities: list[set[str]] = []
    try:
        communities = list(nx.community.greedy_modularity_communities(G))
    except Exception:  # noqa: BLE001
        communities = [set(G.nodes())]

    node_cluster: dict[str, int] = {}
    for idx, comm in enumerate(communities):
        for n in comm:
            node_cluster[n] = idx

    nodes = [
        {
            "id": n,
            "pagerank": round(pr.get(n, 0), 6),
            "degree": G.degree(n),
            "cluster": node_cluster.get(n, 0),
        }
        for n in G.nodes()
    ]
    nodes.sort(key=lambda x: x["pagerank"], reverse=True)

    edges = [
        {"source": a, "target": b, "weight": d.get("weight", 1)}
        for a, b, d in G.edges(data=True)
    ]

    top_kw = [{"keyword": n["id"], "score": n["pagerank"]} for n in nodes[:20]]

    clusters = [
        {"id": idx, "keywords": sorted(comm, key=lambda k: pr.get(k, 0), reverse=True)[:10]}
        for idx, comm in enumerate(communities)
    ]

    return {
        "nodes": nodes[:80],
        "edges": edges[:200],
        "top_keywords": top_kw,
        "clusters": clusters[:8],
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
    }

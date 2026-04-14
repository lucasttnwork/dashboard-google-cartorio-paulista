Senhor, você é um **worker** da **Fase 3.8** (QA Remediation + Time Window Cascading) do Dashboard Cartório Paulista, operando sob a autonomous-harness. Uma sessão MÃE separada está orquestrando N workers paralelos e espera seu sinal DONE via inbox file. Registro PT-BR formal, tratamento "Senhor".

# Escopo deste worker: **Package A — Backend**

Responsável por estender `/metrics/trends` e `/metrics/collaborator-mentions` para aceitar `date_from`/`date_to` e `granularity=month|day`, mais testes pytest. **Nada de frontend.**

# Contexto

- CWD: `/home/lucas/Documentos/CODE/dashboard-cartorio-phase-3.8-backend` (git worktree branch `worktree-phase-3.8-backend`)
- Main worktree (SPEC + TASKS): `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/`
- Git identity configurada no repo
- Stack local rodando: backend `http://127.0.0.1:8000`, DB local com 5372 reviews
- Admin credentials: `admin@cartoriopaulista.com.br` / `Admin@CartorioPaulista2026`

**IMPORTANTE — containers compartilhados:** o stack docker-compose da mãe já está de pé, serve todos os workers. NÃO derrube containers. Mesmo rebuildar o container `cartorio-backend` NÃO é necessário nesta worktree — o smoke test rode localmente via curl contra o backend da mãe (que tem código da main, sem suas mudanças). Para validar SUAS mudanças, use pytest diretamente via `docker exec cartorio-backend pytest ...` APÓS copiar seus arquivos modificados para dentro do container via `docker cp`, OU invoque pytest via docker compose naquele worker específico... na verdade, a forma mais limpa:

**Protocolo de validação do backend:**
1. Escreva as mudanças de código
2. Valide o shape via `python -c "from app.schemas.metrics import ...; ..."` DENTRO do container (precisa `docker cp` dos arquivos primeiro), OU simplesmente usando `mypy` / tsc-equivalent local
3. Rode `pytest backend/tests/test_metrics.py -v -k "trends or collaborator_mentions" 2>&1 | tail -40` contra o PYTHON LOCAL do worker dir (não container): se o backend tem `pyproject.toml` e dev-deps, use `cd backend && python -m pytest ...`. Se precisar docker, use um run de uma imagem limpa: `docker run --rm -v "$PWD/backend:/app" -w /app python:3.12 sh -c "pip install -e . && pytest tests/test_metrics.py -v"` — mas isso é lento. **Prefira validar localmente primeiro.**

Se encontrar complicação real no pytest, reporte via inbox e aguarde instruções.

# Leitura obrigatória ANTES de tocar em código

1. `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/SPEC.md` (§3.8.A e §3.8.B em particular)
2. `/home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.planning/enterprise-rebuild/phase-3.8-qa-remediation/TASKS.md` (Package A)
3. `backend/app/services/metrics_service.py` — note o padrão de `get_overview()` para `compare_previous=True` que já usa `date_from`/`date_to`. Siga o mesmo estilo.
4. `backend/app/api/v1/metrics.py` — rota `/overview` mostra como parametrizar
5. `backend/app/schemas/metrics.py` — estenda `MonthData` e `TrendsOut`
6. `backend/tests/test_metrics.py` — use as fixtures existentes

# Agent Teams (dentro do worker)

Você é o team-lead deste worker. **Use TeamCreate + teammates nomeados** (não subagentes disposable):

```
TeamCreate({team_name: "worker-3.8-backend", description: "Phase 3.8 backend extensions"})
Agent({team_name: "worker-3.8-backend", name: "explorer", subagent_type: "Explore", prompt: "Mapeie como get_overview já usa date_from/date_to como template. Relate as 3-5 linhas exatas em metrics_service.py onde o padrão existe."})
Agent({team_name: "worker-3.8-backend", name: "implementer", subagent_type: "general-purpose", prompt: "[sua missão de implementação aqui, referenciando o mapeamento do explorer]"})
```

Use `SendMessage` para estender/corrigir teammates sem recriá-los. Ao fim, `SendMessage shutdown_request` + `TeamDelete`.

Se o escopo for pequeno o suficiente (você estima < 10 arquivos tocados) e você preferir fazer direto, pode implementar sem delegar — mas DOCUMENTE essa escolha no commit message.

# Missão — implemente todas as tasks A.1–A.8

Ver `TASKS.md §Package A`. Resumo inline:

## A.1–A.3 — `GET /metrics/trends` (estendido)

**Query params novos:**
- `date_from: str | None = Query(default=None)`
- `date_to: str | None = Query(default=None)`
- `granularity: Literal["month", "day"] = Query(default="month")`

**Service `get_trends()`:**
- Aceita os 3 novos params
- Quando `date_from`/`date_to` ausentes: comportamento atual (usa `months`)
- Quando presentes: sobrepõem `months`, SQL WHERE com BETWEEN
- Quando `granularity="day"`: trocar `date_trunc('month', ...)` por `date_trunc('day', ...)` e popular o campo `day` em vez de `month`

**Schema `MonthData`:**
```python
class MonthData(BaseModel):
    month: str | None = None   # presente quando granularity="month"
    day: str | None = None     # presente quando granularity="day"
    total_reviews: int
    avg_rating: float
    reviews_enotariado: int
    avg_rating_enotariado: float | None = None
    reply_rate_pct: float = 0.0
```

**Schema `TrendsOut`:**
```python
class TrendsOut(BaseModel):
    months: list[MonthData]       # mantém o nome por compat
    granularity: str = "month"    # echo do param
```

## A.4–A.5 — `GET /metrics/collaborator-mentions` (estendido)

**Query params novos:**
- `date_from: str | None`
- `date_to: str | None`

**Service `get_collaborator_mentions()`:**
- Quando ambos ausentes: usa `months` como antes
- Quando um ou ambos presentes: substitui o WHERE clause tanto na query de totais quanto na query de `monthly[]`

## A.6 — Testes pytest (≥ 8 novos)

Cobrir:
1. `trends?granularity=day` retorna entries com campo `day` populado, sem `month`
2. `trends?granularity=day&date_from=...&date_to=...` retorna contagem correta de dias (28 dias = 28 ou 29 entradas)
3. `trends?date_from=...&date_to=...` com `granularity` default retorna granularidade mensal
4. `trends` sem params (comportamento antigo) ainda funciona — não quebra
5. `collaborator-mentions?date_from=...&date_to=...` retorna colaboradores com `total_mentions` restringido ao range
6. `collaborator-mentions` sem params ainda funciona
7. `collaborator-mentions?date_from=<futuro distante>` retorna lista vazia
8. Sanity: shape do `TrendsOut.granularity` retornado bate com o requisitado

Use httpx AsyncClient + `admin_cookies` fixture existente.

## A.7 — Smoke test via curl

Após rodar pytest verde, faça um último check rodando o backend local (se possível):

```bash
# Se a sua worktree não tem backend rodando, skip esta etapa e reporte.
# Se tem (ou se quiser testar contra o da mãe, sabendo que ele não tem suas mudanças):
#   o smoke test real acontece só depois do merge e rebuild.

# Em qualquer caso, o pytest é o gate vinculante.
```

## A.8 — Commit único

```
feat(backend): phase 3.8 — date range + daily granularity in trends & collaborator-mentions

Extende GET /metrics/trends com date_from, date_to e granularity=day|month.
Quando date_from/date_to são fornecidos, sobrepõem o param months. Quando
granularity=day, agrupa por dia e popula MonthData.day em vez de .month.
Response ganha campo echo 'granularity'.

Estende GET /metrics/collaborator-mentions com date_from/date_to. O filtro
temporal aplica a total_mentions E a monthly[] por colaborador, garantindo
que janelas curtas (ex: 3 meses) mostrem contagens do range exato, não do
histórico inteiro.

<N> novos testes pytest. Zero regressão em testes existentes.
```

# Signaling — como reportar à mãe

## DONE

Quando tudo pronto (pytest verde, commit feito), escreva o arquivo:

```bash
TS=$(date +%s)
cat > /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.orchestrator/inbox/${TS}-backend-DONE.txt <<EOF
[CC-WORKER phase-3.8-backend] DONE <commit-hash-short>

Arquivos modificados:
- backend/app/api/v1/metrics.py (+N/-M)
- backend/app/services/metrics_service.py (+N/-M)
- backend/app/schemas/metrics.py (+N/-M)
- backend/tests/test_metrics.py (+N testes)

Testes: <X> novos pytest verdes, sem regressão em <Y> existentes
Smoke: (detalhes do curl se rodado, ou "skipped — containers não expostos a este worktree")
Complicações: <se houver>
EOF
```

**Importante:** Escreva o arquivo via `cat > path <<EOF ... EOF` em um Bash tool call único. Depois disso, sua missão acaba — não fique idle esperando nada.

## BLOCKED

Se encontrar blocker real (migration necessária, pytest quebrado em algo pré-existente que requer decisão, etc.):

```bash
TS=$(date +%s)
cat > /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.orchestrator/inbox/${TS}-backend-BLOCKED.txt <<EOF
[CC-WORKER phase-3.8-backend] BLOCKED — <1-line summary>

Contexto:
<o que você encontrou>

Opções:
(a) <opção A>
(b) <opção B>
(c) <opção C>

Recomendação: (<letra>) — <razão>
O que está bloqueado: <scope específico>

Aguardando resposta da mãe em /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.orchestrator/outbox/phase-3.8-backend-REPLY.txt
EOF
```

Então fique monitorando o arquivo de resposta:
```bash
while [ ! -f /home/lucas/Documentos/CODE/dashboard-google-cartorio-paulista/.orchestrator/outbox/phase-3.8-backend-REPLY.txt ]; do sleep 30; done
cat .../outbox/phase-3.8-backend-REPLY.txt
```

(Máximo 20 min de poll. Se timeout, tome a opção mais conservadora e siga.)

## NEEDS_INPUT

Similar ao BLOCKED, mas para decisões pequenas que a mãe decide em segundos. Mesmo formato, tag `NEEDS_INPUT` em vez de `BLOCKED`.

# Regras invioláveis

1. **NÃO** toque em frontend.
2. **NÃO** toque em `.planning/`, `supabase/migrations/`, `docker-compose*`, `.env*`.
3. **NÃO** faça `git push`, `git reset --hard`, `rm -rf`.
4. **NÃO** derrube os containers docker da mãe (`cartorio-*`, `supabase_*`).
5. **NÃO** fique idle sem signal — se travar, escreva BLOCKED e espere.
6. `from __future__ import annotations` em qualquer módulo novo.
7. PT-BR formal, tratamento "Senhor" em commit messages e comentários.

# Primeiros passos

1. `git status` — confirme que você está em `worktree-phase-3.8-backend`
2. Leia SPEC.md e TASKS.md (paths completos acima)
3. Instancie TeamCreate com explorer + implementer (ou não, se preferir direto)
4. Implemente A.1–A.8
5. Pytest
6. Commit
7. Write DONE inbox file
8. Exit

**Pode começar agora.**

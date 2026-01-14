---
description: SOP para enriquecer aliases de colaboradores com análise manual de reviews
globs: directives/*.md
alwaysApply: false
---

# SOP de imputação de aliases com agente manual

Este fluxo segue o modelo 3-layers descrito em [agent_instructions](mdc:.cursor/rules/agent_instructions.mdc). O objetivo é permitir a execução manual de um script determinístico que busca comentários recentes na tabela `reviews`, identifica menções a cada colaborador ativo e registra novos aliases para posterior sincronização com o Supabase.

## Visão geral do processo

1. **Diretiva (Layer 1)** – O responsável define o período que deseja analisar (ex.: últimos 7 dias) e dispara o script `execution/review_alias_imputer.py` fora do Dashboard. Todas as variáveis sensíveis são lidas do `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`).
2. **Orquestração (Layer 2)** – O script:
   - consulta reviews na janela informada;
   - carrega os colaboradores ativos da tabela `collaborators` (aproveitando `full_name` e `aliases`);
   - monta prompts com instruções claras para o modelo leve da OpenRouter (ex.: `gpt-4o-mini`) e detecta menções dentro de cada comentário;
   - gera um arquivo temporário em `.tmp/` com as menções encontradas e os termos usados pelos autores.
3. **Execução (Layer 3)** – O script é determinístico (Python), testado e separado do Dashboard. Cada execução gera um JSON contendo `full_name`, `collaborator_id`, `mention_text`, `review_id` e `context`, permitindo triagem manual antes de alterar a base.

## Procedimento recomendado

1. Atualize o `.env` com as chaves necessárias e escolha a janela desejada.
2. Execute `python execution/review_alias_imputer.py --days 7` (ou outro valor). O script grava, por exemplo, `.tmp/collaborator_aliases_2025-12-02T130501.json`.
3. Abra o JSON gerado, valide:
   - se a `mention_text` está correta;
   - se já consta nos `aliases` conhecidos;
   - se faz sentido adicionar a variação detectada.
4. Após aprovação, execute o helper `execution/upsert_collaborator_aliases.py --file .tmp/collaborator_aliases_<timestamp>.json` (ou o caminho do artefato atual) para que o script processe o JSON e faça o _upsert_ em lote. O script:
   - lê `mention_text` para cada `collaborator_id`, deduplica termos;
   - carrega o colaborador correspondente e combina os `aliases` existentes com as novas variantes, evitando duplicatas;
   - atualiza a tabela `collaborators` via Supabase REST indicando `Prefer: return=representation` para validar a operação sem criar registros extras;
   - grava logs simples na saída padrão para auditar cada atualização e facilitar reversões manuais.
5. Documente decisões relevantes (eventuais menções falsas ou termos com ambiguidade) no mesmo SOP para alimentar aprendizados futuros.
6. O modelo foi instruído para retornar `mention_text` apenas com o nome citado, e o script pós-processa cada menção para garantir que apenas fragmentos curtos (baseados no nome completo e nos aliases conhecidos) sejam salvos no JSON. Menções muito longas ou sem correspondência direta são ignoradas e exibem um aviso no log.

## Critérios de sucesso

- O script permanece separado da UI do Dashboard e é executado manualmente.
- O JSON temporário contém apenas menções validadas pelo modelo.
- O time revisa o arquivo antes de tocar o Supabase, garantindo que aliases coerentes sejam adicionados.

## Atualizações e manutenção

- Se o modelo OpenRouter mudar, atualize as instruções no script e nesta SOP.
- Registre qualquer ajuste no fluxo em `directives/review_alias_sop.md` para manter o history de decisões.


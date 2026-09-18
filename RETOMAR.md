# Retomar daqui

Este arquivo é o ponto de entrada do repositório: o que este front é, onde as
peças estão, como pôr no ar, o que ele faz e o que está em aberto. Ele descreve
o estado atual — não o caminho até ele.

---

## 1 · O que é este repositório

O front do Otimizador CAPEX (React 18 + Vite + TypeScript + Tailwind), ligado ao
backend FastAPI. Duas regras valem como invariante:

- **Mantém o backend, modifica o front.** Mudança no servidor só quando não há
  como resolver do lado de cá — expor dado que o banco tem e a API não manda.
- **Nada mockado.** Todo dado vem do backend, que consulta o Postgres. Se algo
  parecer precisar de mock, falta rota, não fixture.

## 2 · Onde está cada coisa

| | repositório | branch |
|---|---|---|
| **Front** (este) | `LucioFlavioRosa/front-final-capex` | `main` |
| **Backend** | `LucioFlavioRosa/back` | ver `git branch` — o trabalho corrente costuma estar numa `feat/*` |

Na máquina: o backend em `~/projetos/otimizador-backend`, o front original
(referência de completude, porta 8080) em `~/projetos/otimizador-cadastro-web`,
e o motor em `~/projetos/pacote-otimizador-main` (**não** é repositório git).

## 3 · Pôr no ar

O guia completo é `SUBIR_LOCAL.md`, no repositório do backend. O caminho curto:

```bash
# backend + banco + fila (containers já criados: start, NÃO up)
cd ~/projetos/otimizador-backend
docker compose -f docker-compose.yml -f docker-compose.e2e.yml start

# o executor da rodada, FORA do Docker (sem ele a rodada fica PENDENTE)
python -u dev/worker.py --tempo 1000

# este front (serviço `ses-web`; --build quando o código mudou)
cd <este repositório>
docker compose -f docker-compose.local.yml up -d --build ses-web
```

| endereço | o que é |
|---|---|
| `localhost:8090` | **este** front |
| `localhost:8080` | o front original, referência de completude |
| `localhost:8000` | a API (`/readyz`, rotas sob `/api`) |
| `localhost:55432` | Postgres (`otim` / `otim` / `otimizador`) |

O banco mora no volume nomeado `db-dados` (declarado no `docker-compose.yml`
do backend): sobrevive a `up`, `down` e `docker volume prune`; some só com
`down -v`. Os dumps de volta são `dev/cadastro_base.dump` no repositório do
backend (só cadastro) e `otimizador_completo_*.dump` no OneDrive do Teams
(cadastro + rodadas). Para conferir dado, use o dump completo mais recente em
`Downloads`, restaurado num banco à parte — o banco de desenvolvimento é
parcialmente semeado e engana.

## 4 · O que o front faz

**Cadastro** (`/cadastro`, `src/components/ses/cadastro`, `src/domain`,
`src/lib/cadastroApi.ts`)

- A ponte com o backend é `cadastroApi.ts`: lê 5 endpoints e monta as abas do
  `SCHEMA` (`src/data/cadastroUnidade/schema.ts`). `lerCadastro` devolve a
  `BaseDoCadastro` — o payload cru —, e `salvarCadastro` grava ficha a ficha só
  o que mudou em relação a ela; sem base, recusa (`CadastroSemLeitura`).
- Ordem do Salvar: empresa, contrato, sub-bacias, ETEs, unidade (desmarcar
  macrorregião), **topologia**, **fichas de CTS**, unidade (marcar). A ficha da
  CTS vai depois da topologia porque a ficha da macrorregião nasce no servidor
  na colocação.
- **Macrorregião de CTS** é regime da unidade (caixa na aba Unidade, grava na
  hora e relê). Marcada, cada sistema aceita uma CTS e o Fluxo oferece
  macrorregiões; desmarcada, aceita várias e oferece coletores. O motor não
  conta CTS por sistema; isso é cadastro. Não confundir com `USAR_CTS`, o
  parâmetro de rodada (Sim/Não) que decide se a CTS entra na simulação.
- A CTS pertence ao SISTEMA (`sistema-topologia`); `subbacia-cts` é
  sobreposição de área, não pertinência, e não aparece na tela.
- **CTS fora de sistema** vêm na leitura (`GET /cts?incluirLivres=1`) com a
  ficha e as obras da origem, sistema em branco. Elas não contam na completude
  nem no portão da Revisão (`linhasQueContam`, `validarTopologia`): o motor só
  lê o que está num sistema.
- **Planilha do cadastro** (aba Unidade, cartão abaixo da caixa de
  macrorregião): "Baixar planilha preenchida" gera um `.xlsx` com o cadastro
  inteiro — `Leia-me`, uma aba por aba visível, aba de apoio `Sistemas` —, e
  "Importar planilha preenchida" mescla a volta no estado da tela. Nada é
  gravado na importação; Salvar é o mesmo de sempre. O modelo e a mescla estão
  em `src/domain/planilha.ts`; o arquivo em `src/lib/planilhaCadastro.ts`
  (exceljs, carregado sob demanda). Regras: só colunas que a unidade preenche
  voltam; ids não mudam; a aba Unidade carrega o `unidade_id` e o regime, e
  arquivo de outra unidade ou de outro regime é recusado (no segundo caso, só
  as abas de CTS); Metas de cobertura e Escala de paridade são listas (a do
  arquivo substitui a da tela) e toda cidade sem registro ganha uma
  linha-modelo no arquivo; a CTS livre entra num sistema pela coluna
  `sistema_id` de "Dados da CTS" (id ou nome) — mudar ou sair é pela tela; a
  caixa da macrorregião é só leitura na planilha.
- Recorte por nível: as abas grandes abrem recortadas pela barra de escopo
  (empresa · sistema · cidade), derivado no render.
- Editar/Salvar por botão; não existe "abrir todos os sistemas".

**Simular** (`/simular`, `src/rodada/pages/Simular.tsx`): os parâmetros da
rodada (orçamento, janela, base de receita, cobertura medida em, objetivo,
usar CTS Sim/Não, recorte da cobertura), a prontidão da unidade e o disparo.

**Resultados** (`/resultados/:runId`, `src/rodada`): visão global com abas
(plano, por quê, sensibilidade, mapeamento por cidade), cidade, sistema,
sub-bacia e obra; histórico e comparação de rodadas; sensibilidade como
varredura de variação de CAPEX (−95% a +500%), acompanhando a fila do
servidor.

## 5 · Testes

```bash
npm run lint             # tsc --noEmit
npm test                 # unitários, com MSW
npm run test:integracao  # contra o backend REAL (precisa dele no ar; grava e restaura)
npm run test:perf        # medição — fileParallelism: false de propósito
```

No backend, `python -m pytest -q` — com `POSTGRES_URL` apontando para o banco,
senão os testes de banco pulam em silêncio:

```bash
POSTGRES_URL="postgresql://otim:otim@localhost:55432/otimizador" python -m pytest -q
```

Não rode sondagem manual em paralelo com a suíte de integração: ela escreve no
banco real e restaura no fim.

## 6 · Em aberto

1. **Teste de integração `unidadeDoCadastro › recusa a SEGUNDA CTS`** falha:
   escolhe uma macrorregião livre de uma empresa e um sistema vazio de outra,
   e o servidor recusa pela regra "macrorregião só entra em sistema da empresa
   que a opera". O teste precisa escolher sistema da mesma empresa.
2. A uB2 continua com suas 186 CTS colocadas; nunca foi decidido se ficam.
3. Os ids das CTS nascem `cts_d1b100_1_1` na planilha do Databricks; enquanto
   isso, `dev/normalizar_ids_cts.sql` (backend) roda após cada carga.
4. `unidade_capacidade` da ETE: o motor lê e o banco tem, mas API e tela não
   expõem.
5. Quando o front original (`:8080`) sai do ar.

## 7 · Armadilhas

- **O `PUT` substitui a ficha inteira.** Campo que a tela não manda vira `NULL`
  no banco. Ao acrescentar coluna, confira os **dois** sentidos da ponte.
- **Campo derivado não volta na gravação.** `ticket_medio` e `capacidade_ociosa`
  são conta do servidor.
- **Número viaja como texto pt-BR estrito** (`1.234,5`); ano sem separador de
  milhar (`pt_br_ano` no servidor, `COLUNAS_SEM_SEPARADOR` na planilha).
- **As linhas sem sistema da topologia carregam `emp_codigo`, `cidade_id` e
  `macro`**, que não são colunas da grade — o seletor de CTS depende delas.
  Toda mescla parte das linhas da tela.
- **Revisão do Codex no Windows:** pelo CLI direto, e com `stdin` fechado
  quando em segundo plano:
  `codex exec --sandbox danger-full-access --skip-git-repo-check -o relatorio.md "$(cat prompt.md)" < /dev/null`

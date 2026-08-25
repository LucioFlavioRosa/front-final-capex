# Retomar daqui

Pausado em **24/08/2026**. Este arquivo é o ponto de entrada: onde as peças estão,
como pôr no ar, o que está pronto e o que ficou em aberto.

---

## 1 · O que é este repositório

O front do Cadastro do Otimizador CAPEX, na linha do protótipo que o cliente pediu
(React 18 + Vite + TS + Tailwind), ligado ao backend que já existia.

Duas decisões dele valem como invariante, e não como preferência:

- **Mantém o backend, modifica o front.** Mudança no servidor só quando não há como
  resolver do lado de cá — foi o caso de expor campos que o banco tinha e a API não
  mandava.
- **Nada mockado.** Todo dado vem do backend, que consulta o Postgres. `src/data/mock.ts`
  e `src/data/ses.ts` foram apagados por isso; se algo parecer precisar de mock, é sinal
  de que falta rota, não de que falta fixture.

## 2 · Onde está cada coisa

| | repositório | branch | último commit |
|---|---|---|---|
| **Front** (este) | `LucioFlavioRosa/front-final-capex` | `main` | `a85857e` |
| **Backend** | `LucioFlavioRosa/back` | `feat/executor-com-lease-e-4-paralelo` | (ver §6) |

Na máquina: o backend em `~/projetos/otimizador-backend`, o front original — que segue
sendo a referência de completude — em `~/projetos/otimizador-cadastro-web`, e o motor em
`~/projetos/pacote-otimizador-main` (**não** é repositório git).

## 3 · Pôr no ar

O guia completo é `SUBIR_LOCAL.md`, no repositório do backend. O caminho curto:

```bash
# backend + banco + fila
cd ~/projetos/otimizador-backend
docker compose -f docker-compose.yml -f docker-compose.e2e.yml start   # start, NÃO up

# este front
cd <este repositório>
docker compose -f docker-compose.local.yml up -d ses-web               # serviço: ses-web
```

| endereço | o que é |
|---|---|
| `localhost:8090` | **este** front |
| `localhost:8080` | o front original, referência de completude |
| `localhost:8000` | a API (`/readyz`, rotas sob `/api`) |
| `localhost:55432` | Postgres (`otim` / `otim` / `otimizador`) |

> ### `start`, e não `up` — isto apaga o banco
>
> O serviço `db` **não tem volume nomeado**: o dado mora na camada gravável do container,
> num volume anônimo. `start` religa o que existe; um `up` que decida recriar o `db`, ou um
> `docker volume prune` de rotina, apagam tudo.
>
> Se acontecer, não se perde nada: `dev/cadastro_base.dump` no repositório do backend está
> atualizado até 24/08 e traz todo o estado descrito no §4. É o passo 3 do `SUBIR_LOCAL.md`.

## 4 · Em que estado o banco está

O dump do backend reproduz exatamente isto:

| | |
|---|---|
| ids das CTS | 337, todos no padrão `cts_001` — sem sub-bacia no nome |
| CTS esperando sistema | 151 (cadastradas, ainda não colocadas em sistema nenhum) |
| régua de cobertura | as 141 cidades preenchidas |
| trilha de auditoria | 283 linhas, **zero órfãs** em qualquer tipo |
| rodadas | nenhuma — você gera as suas |

## 5 · O que está pronto

- Adaptação ao backend: a ponte é `src/lib/cadastroApi.ts`, que lê 5 endpoints e monta as
  15 abas. `ultimaLeitura` guarda o payload cru como base do diff — e é por isso que
  `salvarCadastro` recusa gravar sem uma leitura da mesma sessão.
- Recorte por nível: as abas grandes abrem recortadas (a de obras vai de 3.755 linhas
  para 5), derivado **durante o render** e não num efeito.
- Performance: abrir Sub-bacias custava 3.084ms para pintar UMA linha; hoje 17ms. A causa
  eram os funis de coluna refazendo `Set` + ordenação a cada render, com o painel fechado.
- Campos: as 4 colunas residenciais, `ticket_medio` (derivado, só leitura), e a janela da
  obra (`obra_obrigatoria_ano`, `obra_proibida_ate`) nas **três** abas de obra.
- "Cobertura medida em" na aba de Concessão, com as três réguas.
- Editar/Salvar por botão, excluir CTS do sistema, caixa "usa sistema de CTS".

### Testes — três suítes, cada uma com um propósito

```bash
npm run lint             # tsc --noEmit
npm test                 # 184 unitários, com MSW
npm run test:integracao  # 26, contra o backend REAL (precisa dele no ar)
npm run test:perf        # 3, medição — fileParallelism: false de propósito
```

No backend, `python -m pytest -q` — mas com `POSTGRES_URL` apontando para o banco, senão
**5 testes se pulam em silêncio**, entre eles o que valida a lista de campos inteiros
contra o schema real:

```bash
POSTGRES_URL="postgresql://otim:otim@localhost:55432/otimizador" python -m pytest -q
```

Um deles (`janelaDaObra.integracao`) **escreve no banco real** e restaura no `afterAll`.
Não rode sondagem manual em paralelo: sujar o dado no meio faz o teste reportar como
defeito algo que foi você.

## 6 · O que ficou em aberto — decisões suas

1. **A uB2 continua com suas 186 CTS atreladas.** Nunca foi decidido se elas ficam ou se
   voltam para a lista de "esperando sistema", como as 151 da uB1.
2. **A correção definitiva dos ids das CTS é na planilha do Databricks.** Enquanto ela
   gerar `cts_d1b100_1_1`, o script `dev/normalizar_ids_cts.sql` tem de rodar depois de
   cada carga. Ele é idempotente e trava as tabelas enquanto roda.
3. **`unidade_capacidade` da ETE** — o motor lê (`otimizador_capex_v62.py:1323`) e o banco
   tem valor real (`L/s`), mas API e tela não expõem. Não há perda de dado (o PUT não toca
   no campo); é lacuna funcional. Ficou de fora por ser assunto diferente da janela da obra.
4. **O front original (`:8080`) segue no ar em paralelo.** Nunca foi dito quando ele sai.

## 7 · Armadilhas que já custaram caro

- **O `PUT` substitui a ficha inteira.** Campo que a tela não manda vira `NULL` no banco.
  Foi assim que a régua de cobertura de 21 cidades foi apagada — restaurada pela trilha de
  auditoria. Ao acrescentar coluna, confira os **dois** sentidos da ponte.
- **Campo derivado não volta na gravação.** `ticket_medio` e `capacidade_ociosa` são conta
  do servidor; devolvê-los faria o cliente responder uma conta que o servidor mesmo fez.
- **Ano não é quantidade.** `pt_br(2028)` devolve `"2.028"`. Existe `pt_br_ano` para isso.
- **A CTS pertence ao SISTEMA** (linha em `input.sistema_topologia`). `input.subbacia_cts`
  é sobreposição de **área**, não pertinência — a relação CTS↔sub-bacia não existe mais.
- **Revisão do Codex no Windows:** pelo plugin ele nunca executa (`blocked by policy`).
  Pelo CLI direto funciona:
  `codex exec --sandbox danger-full-access --skip-git-repo-check "$(cat prompt.md)"`

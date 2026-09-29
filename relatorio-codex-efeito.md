# Revisao adversarial: efeito-base fora da conta

Data da revisao: 29/09/2026. Repositorios revisados:

- motor: `C:\Users\LúcioFláviodosSantos\projetos\_motor_src`, branch `feat/sem-efeito-base`, diff `origin/main..HEAD`
- backend: `C:\Users\LúcioFláviodosSantos\projetos\otimizador-backend`, commit `ee6196f`
- front: `C:\Users\LúcioFláviodosSantos\Downloads\ses-frontend\ses-frontend`, commit `035147b`

## Defeitos confirmados

### 1. `run_subbacia_ano.ebitda` continua incluindo efeito-base, e o leitor offline ainda o usa

Arquivos:

- `C:\Users\LúcioFláviodosSantos\projetos\_motor_src\otimizador\infraestrutura\persistencia.py:699`
- `C:\Users\LúcioFláviodosSantos\projetos\_motor_src\otimizador\apresentacao\leitor_v2.py:136`

Cenario concreto, rodada nova `run_20260928_232222_9e6611`:

- `otim_subbacia_ano` ainda grava `ebitda = receita_direta + receita_indireta + efeito_base - opex_rateado`.
- No total da rodada, isso da `ebitda_gravado = 419.554.076,99`.
- A regra nova da `receita de ligacao nova - opex_rateado` da `351.837.944,98`.
- Excesso: `67.716.132,01`, exatamente o efeito-base.
- Exemplo cidade/ano: Rio de Janeiro 2032 tem receita nova `6.922.687,14`, efeito `1.398.149,12`, opex `2.562.152,10`; o EBITDA correto e `4.360.535,04`, mas a coluna gravada traz `5.758.684,16`.

O backend se protegeu em `nivel_global.py:211`, recalculando por cidade como `SUM(receita_direta + receita_indireta - opex_rateado)`. Mas o `leitor_v2.py:140-143` ainda soma a coluna `ebitda` gravada e ainda calcula `receita_total = direta + indireta + efeito_base`; entao quem usar esse leitor ve EBITDA/margem com efeito-base reintroduzido.

### 2. O EBITDA por cidade nao soma o EBITDA global por diferenca de OPEX rateado

Arquivo:

- `C:\Users\LúcioFláviodosSantos\projetos\otimizador-backend\app\infra\repositorios\nivel_global.py:211`

Cenario concreto, rodada `run_20260928_232222_9e6611`:

- `SUM(otim_ano.receita) = 523.322.020,98`.
- `SUM(receita_direta + receita_indireta)` em `otim_subbacia_ano = 523.322.020,98`: receita fecha.
- `SUM(otim_ano.opex) = 170.895.334,66`.
- `SUM(otim_subbacia_ano.opex_rateado) = 171.484.076,00`.
- Diferenca de OPEX: `588.741,34`.
- Resultado: EBITDA global da API `/ebitda` e `352.426.686,32`; somando o mesmo calculo por cidade da `351.837.944,98`.

Isso nao e efeito-base: e diferenca de rateio/serie anual. A formula nova por cidade e correta quanto a tirar efeito-base, mas nao e reconciliavel com o total global enquanto o `opex_rateado` nao fechar com `otim_ano.opex`.

## Item 1: caminhos que subtraem o efeito-base

Veredito geral: nao achei duplo desconto para rodada nova publicada pelo motor novo, porque o motor zera `vp_efeito_base` em `run_meta` e `run_subbacia`. Achei, sim, caminhos que continuam subtraindo e dependem desse contrato.

- `cascata.SEM_EFEITO_BASE` em `app/infra/repositorios/cascata.py:107`: subtrai `vpl - vp_efeito_base`. Correto para rodadas antigas; para novas subtrai zero. Comentario acima esta desatualizado e ainda diz que o motor soma o efeito no VPL.
- `cascata.vpl_do_produto()` em `cascata.py:110`: mesma regra em Python. Correto para antigas e novas.
- Cascata do fluxo em `cascata.py:199-226`: soma `otim_subbacia.vp_efeito_base` e chama `vpl_do_produto(SUM(vpl), SUM(efeito))`. Correto para antigas; para a rodada nova `run_20260928_232222_9e6611`, `SUM(vp_efeito_base)=0`, entao nao desconta de novo.
- Lista de cidades em `nivel_global.py:262`: calcula `otim_cidade.vpl - SUM(otim_subbacia.vp_efeito_base)`. Correto sob o contrato novo, porque `run_subbacia.vp_efeito_base=0` em rodada nova.
- Detalhe da cidade em `nivel_detalhe.py:357-372`: subtrai `SUM(otim_subbacia.vp_efeito_base)`. Mesmo veredito: correto para antigas e zero para novas.
- Detalhe da sub-bacia em `nivel_detalhe.py:568-571`: subtrai a propria coluna `vp_efeito_base`. Correto para antigas e zero para novas.
- Historico/meta/sensibilidade em `resultado.py:309`, `resultado.py:436` e `api/resultados.py:468`: usam `vpl_do_produto(vpl, vp_efeito_base)`. Correto para antigas e novas.

Conferencia no banco:

- O banco de desenvolvimento tem 127 rodadas, nao 134.
- 124 tem `otim_meta.vp_efeito_base <> 0`.
- 3 tem `vp_efeito_base = 0`; a rodada nova com efeito informativo e `run_20260928_232222_9e6611`.
- Em todas as 127, `otim_meta.vp_efeito_base` e `SUM(otim_subbacia.vp_efeito_base)` batem ate ruido de ponto flutuante; nao ha rodada nova com meta zerada e sub-bacia nao zerada.

## Rodadas antigas x novas

A premissa da subtracao continua correta para o VPL apresentado:

- antigas: `vpl` inclui efeito e `vp_efeito_base` vem preenchido; backend subtrai.
- novas: `vpl` ja vem sem efeito e `vp_efeito_base=0`; backend subtrai zero.

Comparacoes entre rodadas:

- Historico usa `vpl_do_produto`, entao compara o numero sem efeito nas duas geracoes.
- Sensibilidade usa `vpl_do_produto` para os pontos publicados, entao nao vi mistura errada de efeito-base.
- Ressalva de negocio: o front ja documenta que rodadas antigas foram escolhidas com a funcao antiga, embora o numero apresentado seja sem efeito. Isso e comparacao de planos escolhidos sob regras diferentes, nao erro aritmetico.

## Receita e EBITDA no backend

Receita:

- `otim_ano.receita` esta preenchida em todas as 127 rodadas do banco consultado.
- Nao ha linha com `receita IS NULL` e `receita_total` preenchida.
- A API de painel da rodada nova le a coluna nova: em 2028, por exemplo, retorna `receita = 1.744.656,71`, nao receita total com efeito.
- A listagem/meta passou a somar `otim_ano.receita`; isso tambem aplica a regra nova a rodadas antigas sem republicar.

EBITDA:

- Sem cidade, `nivel_global.py:198` usa `receita - opex`, correto.
- Com cidade, `nivel_global.py:211` tira o efeito-base da formula. Isso e igual a `SUM(otim_subbacia_ano.ebitda - efeito_base)` ate ruido menor que centavo nas 41.475 linhas cidade-ano consultadas.
- Mas ha a diferenca de OPEX rateado descrita nos defeitos: a soma das cidades nao fecha no total global.

## Motor

O que esta correto:

- `avaliar()` deixou de somar `_vbase` em `vpl`.
- `ebitda_ano` passou a `receita_ano - opex_ano`.
- `vpl_por_subbacia()` deixou `efeito_base` fora de `vpl`.
- `persistencia.py` grava `run_meta.vp_efeito_base = 0.0` e `run_subbacia.vp_efeito_base = 0.0`, evitando duplo desconto no backend.
- CP-SAT: os caminhos que usam `vpl_obj` e o desempate lexicografico por `vpl` puro ficam coerentes com a decisao, porque agora os dois saem de `avaliar()` sem efeito-base. O caminho `otimizador_capex_cpsat63.py:807` (`res["vpl_obj"]=res["vpl"]`) tambem fica coerente para foco de cobertura.

O que sobrou:

- `leitor_v2.py:141` deveria mudar junto: hoje monta `receita_total = receita_direta + receita_indireta + efeito_base`.
- `persistencia.py:699-705` ainda grava `run_subbacia_ano.ebitda` com efeito-base. O backend evita ler essa coluna, mas ela fica semanticamente errada para rodadas novas.

## Golden e data

Verifiquei o golden com `hoje()` fixado em 2025-01-01:

- ligado: `33.053.288,924913 + 5.537.732,064632 = 38.591.020,989544`.
- desligado: `25.034.710,958666 + 4.323.190,306331 = 29.357.901,264997`.

Capex, cobertura e obras ficaram iguais:

- ligado: capex `6.476.000,00`, cobertura `4.800`, obras `28`.
- desligado: capex `5.640.000,00`, cobertura `3.900`, obras `20`.

Tambem confirmei o defeito do `tests/atualiza_golden.py`: sem fixar `hoje()`, a execucao manual no dia real imprimiu VPL `33.440.738,924913` no ligado, exatamente `387.450,00` acima do golden testado. Com o conserto, `python tests/atualiza_golden.py` imprime os valores do teste. Nao achei outro script/teste com a mesma dependencia de data; os outros usos de `datetime.now()` sao carimbo/id de publicacao, nao cronograma economico.

## Testes invertidos

- `test_o_total_do_kpi_e_a_soma_da_serie_anual` passa no codigo antigo e no novo; ele so prova consistencia entre meta e serie, nao a regra de excluir efeito.
- `test_O_TOTAL_E_SO_AS_LIGACOES_NOVAS` nao passaria no codigo antigo, porque antes esperava `novas + efeito`.
- `test_O_VPL_PUBLICADO_NAO_TEM_EFEITO_BASE_A_SUBTRAIR` nao passaria no codigo antigo, porque `run_meta.vp_efeito_base` e `run_subbacia.vp_efeito_base` vinham preenchidos.
- O nome `test_O_VPL_PUBLICADO_NAO_TEM_EFEITO_BASE_A_SUBTRAIR` promete mais do que afirma: ele verifica que as colunas publicadas para subtracao sao zero, mas nao verifica diretamente que `vpl` publicado e igual a soma `capex + opex + receitas novas` nem que uma rodada persistida no banco/API nao sofreu subtracao dupla.

## Assimetria residencial x total

Pelo codigo atual, a assimetria descrita nao parece sobrar no calculo principal:

- `otimizador_capex_v62.py:1551-1560` monta `sub_receita.ticket` pelo universo que a rodada mede: residencial quando `cobertura_so_residencial=True`, total quando nao.
- Os testes `test_ticket_por_ligacoes_totais.py` cobrem isso explicitamente.
- Exemplo na fixture de classe: com recorte residencial, `b1` usa ticket `225,00` contra `180,00` no total, porque divide pela base residencial; sem recorte, divide pelo total.

Como o efeito-base saiu de VPL/receita/EBITDA, uma pequena superestimativa remanescente nele seria informativa. Mas nao encontrei a mistura "ticket residencial x ligacoes atuais totais" como defeito novo no codigo atual; o ponto remanescente e que `run_ano.receita_efeito_base`/`run_subbacia_ano.efeito_base` ainda seriam afetados por qualquer escolha dessa regua, por serem justamente a serie informativa do excluido.

## O que verifiquei e esta correto

- `python -m pytest` no motor: 179 passed, 13 skipped.
- `python -m pytest` no backend: 465 passed, 9 skipped.
- `npx tsc -b` no front: passou.
- `npm test` no front: 524 passed.
- API local respondeu para painel, EBITDA, cidades e sensibilidade da rodada nova; nao vi duplo desconto de VPL.
- Front commit `035147b` e apenas dicionario; o texto novo esta coerente com a regra e ressalva rodadas antigas escolhidas pela regra velha.


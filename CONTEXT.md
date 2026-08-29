# Front do Otimizador CAPEX

As duas telas do produto: o **cadastro** de uma unidade, montado como wizard de
abas, e o **resultado** de uma rodada, lido em cinco níveis do global até a obra.

O glossário do DOMÍNIO — unidade, sistema, sub-bacia, CTS, ETE, obra, rodada,
explicabilidade — vive no repositório do backend, em `CONTEXT.md`, e é lá que ele
se edita. Duplicá-lo aqui criaria duas definições para envelhecer em ritmos
diferentes. O que segue é só o vocabulário desta camada.

## Language

### Cadastro

**Wizard**:
A tela de cadastro inteira: blocos, abas, grade e a barra de escopo. Uma unidade
por vez.
_Avoid_: formulário, form, stepper

**Aba**:
Uma tabela de cadastro na tela — as 15 do `SCHEMA` são as 15 tabelas de cadastro
do backend, com os mesmos nomes de coluna.
_Avoid_: tab, seção, página

**Bloco**:
O agrupamento de abas no stepper (Hierarquia, Contrato, Sub-bacias, CTS…). É
navegação, não modelo.

**Grade**:
A tabela editável de uma aba. Linha é ficha, coluna é campo.
_Avoid_: tabela, datagrid

**Escopo**:
O recorte que a barra aplica a tudo abaixo dela — cidade e sistema. Na aba do
Fluxo ele recorta a grade E o desenho.
_Avoid_: filtro, seleção

**Origem da coluna**:
De onde o valor vem, e o que a célula deixa fazer: `db` veio do Databricks e é
travada, `un` a Regional preenche, `calc` é derivada na hora de exibir e nunca
gravada.

**Aba oculta**:
Aba que existe no `SCHEMA` por ser elo do modelo, mas sai da navegação —
`ocultaNoWizard`. Não é aba desativada: o dado continua sendo lido e gravado,
exceto onde a ADR disser o contrário.

**Adaptador de cadastro**:
`lib/cadastroApi.ts` — a ponte entre o estado do wizard e as rotas normalizadas
do backend. Ver ADR-0001.
_Avoid_: client, service, api layer

### Resultado

**Nível**:
Um degrau do drill-down: 1 global, 2 cidade, 3 sistema, 4 sub-bacia, 5 obra. A
cascata é a mesma do contrato de leitura.
_Avoid_: página, view, tela

**Casca**:
O invólucro comum dos cinco níveis — cabeçalho da rodada, migalhas e a árvore de
escopo. `rodada/layout/CascaResultado.tsx`.
_Avoid_: layout, shell

**Quadro**:
Um gráfico com sua tabela equivalente. Todo quadro oferece "Ver como tabela" — é
a regra de contraste, não um extra.
_Avoid_: card, chart, widget

**Elementos por ano**:
A série de componentes construídos por ano, com quantidade, unidade, preço
unitário e CAPEX. Aparece nos quatro primeiros níveis, sempre com o mesmo recorte
do nível.

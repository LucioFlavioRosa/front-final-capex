# Existem duas cópias deste front, e o merge é seletivo

O cliente mantém a própria cópia deste código e a evolui por fora, contra o
backend do SES (`app/cadastro/routes.py`, `app/cadastro/template_excel.py`,
`app/users/routes.py` — nada disso existe no backend do Otimizador). As telas de
resultado que vêm de lá são bem-vindas e entram por cópia direta; a camada que
fala com o servidor, não.

O merge de 29/08/2026 trouxe o código do cliente inteiro com três exceções, cada
uma com ADR própria: o adaptador de cadastro (ADR-0001), a aba de pareamento
(ADR-0002) e a janela de obra que a cópia deles havia perdido em
`componentes-cts-capex` e `ete-capex` — o motor lê as duas colunas.

## Consequences

Todo merge vindo de lá precisa reconferir esses três pontos, e o `schema.ts` é o
arquivo onde a divergência se esconde melhor: ele parece cadastro e é contrato.
Os arquivos copiados são reescritos em CRLF, o fim de linha deste repositório —
em LF o diff vira 118 arquivos inteiros e o que de fato mudou some no meio.

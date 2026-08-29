# O tipo de um componente é derivado; o tipo do servidor é a segunda resposta

`tipoDoNo` descobre o que um componente é pela aba em que ele tem ficha —
`subbacia-operacional`, `cts-operacional` ou `ete-capex`. É a resposta certa para
tudo que está dentro de um sistema, e evita comparar contra o rótulo de tela, que
muda com o texto.

Só que a CTS ainda NÃO colocada não tem ficha nenhuma: as 150 livres chegam pela
topologia, em `semSistema`, e são exatamente as que se quer poder adicionar.
Derivar sozinho as apagava da lista, e a tela dizia "nenhuma CTS livre na base"
com 150 delas no payload. Por isso `ehCts` usa a derivação quando ela sabe
responder e cai no `componente_tipo` que o servidor mandou quando ela devolve
`desconhecido`.

## Consequences

A precedência importa e não é simétrica: componente COM ficha é decidido pela
derivação, mesmo que o servidor discorde. Inverter a ordem deixaria um payload
errado renomear um nó.

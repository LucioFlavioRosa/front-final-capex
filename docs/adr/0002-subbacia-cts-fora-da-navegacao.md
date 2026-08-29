# A aba "Pareamento sub-bacia · CTS" fica fora da navegação

`subbacia-cts` está no `SCHEMA` por ser elo do modelo, e sai do wizard com
`ocultaNoWizard`. O backend do Otimizador não serve nem aceita essa aba: o
adaptador a lista em `ABAS_SEM_ESCRITA` e a devolve vazia, porque não há rota de
leitura nem de escrita para `input.subbacia_cts`.

Visível, ela abriria vazia, ofereceria "Adicionar linha" e descartaria o que fosse
digitado ao salvar — as três coisas em silêncio. Uma aba ausente é menos danosa
que uma que finge.

## Consequences

Para religar bastam duas coisas, nesta ordem: o backend ganhar leitura e escrita
de `input.subbacia_cts`, e a aba sair de `ABAS_SEM_ESCRITA`. A cópia do cliente a
mantém visível porque o backend DELES grava a tabela — o argumento é verdadeiro
lá e falso aqui.

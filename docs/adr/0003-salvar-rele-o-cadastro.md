# Salvar relê o cadastro do servidor

`salvar()` chama `salvarCadastro` e, em seguida, `lerCadastro` para re-hidratar o
estado. Há dado que só o servidor sabe montar depois da gravação, e a CTS
recém-colocada é o caso: o botão "Adicionar CTS" escreve o `sistema_id` na linha
do Fluxo e mais nada, porque a ficha dela vem de `GET /unidades/{u}/cts`, que
serve as CTS da unidade — e uma CTS livre não era de unidade nenhuma quando a
tela carregou.

Sem reler, ela ficava meio existente depois de salva: sem tipo na coluna
`componente_tipo`, fora da lista de destinos dos outros componentes e ausente da
aba "Dados da CTS". Três sintomas, uma causa.

## Consequences

Falha na releitura não desfaz o que foi salvo nem acusa erro de gravação — a
gravação já aconteceu, e avisar "não salvou" seria mentira. Entre adicionar a CTS
e salvar, os três sintomas ainda aparecem; fechar essa janela exige o backend
servir também as fichas das CTS livres.

# `cadastroApi.ts` é um adaptador para rotas normalizadas, não um cliente de documento

Este front nasceu contra o backend do SES, que grava o cadastro como DOCUMENTO:
um `POST /api/cadastro` com o estado inteiro do wizard, sobrescrevendo a unidade a
cada chamada. O backend do Otimizador não tem essa rota, e não é lacuna: ele grava
uma FICHA por vez, em tabelas normalizadas, e cada gravação carrega junto a trilha
de override, a contagem de pendências e — na topologia — validações que recusam um
sistema incoerente. Gravar por documento passaria por cima das três.

Por isso a adaptação é no transporte: o wizard continua sendo o que era, e
`lib/cadastroApi.ts` traduz para `/unidades/{u}/hierarquia|contrato|sub-bacias|etes|cts`
e os `PUT` por ficha.

## Consequences

A cópia deste front que o cliente mantém tem um `cadastroApi.ts` de 83 linhas, no
modelo de documento. Substituir o nosso por aquele — num merge, por parecer mais
simples — mata a tela de cadastro inteira contra este backend. Ver
`docs/adr/0005`.

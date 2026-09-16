import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CAMADA_POR_CHAVE, REPOUSO } from '@/rodada/mapa/camadas'

/**
 * O ESTADO DA BANCADA MORA NA URL, E NÃO EM `useState`.
 *
 * O motivo não é purismo: é que esta tela é uma tela de PRINT. O uso real dela
 * é alguém achar uma leitura — "olha o retorno por real de Itaboraí contra o de
 * Magé" — e mandar aquilo para outra pessoa. Com o estado em memória, o link
 * abre no repouso e a frase perde o referente; a pessoa do outro lado recebe
 * "olha isso" apontando para lugar nenhum.
 *
 * Ganha-se de brinde o BOTÃO VOLTAR, que era o defeito de fechamento mais
 * provável de um cartão sobreposto: quem abre uma sobreposição espera que
 * voltar a feche, e sem isso "voltar" sai da tela inteira.
 *
 * ## PUSH × REPLACE — a distinção que faz o histórico ser usável
 *
 * `camada` e `ano` andam com REPLACE. São controles de exploração: clicar em
 * seis pílulas seguidas empilharia seis entradas, e aí "voltar" percorreria
 * uma a uma em vez de fechar o cartão. Abrir e fechar o cartão anda com PUSH,
 * porque é a única transição desta tela que o usuário lê como "entrei em algum
 * lugar".
 *
 * ## O QUE NÃO ESTÁ AQUI
 *
 * `ativa` — o realce de hover. Ele muda dezenas de vezes por segundo; na URL
 * seria um `history.replaceState` por movimento do mouse. Continua em `useState`
 * dentro de `Bancada`, que é onde ele pertence.
 */

/** Os nomes dos parâmetros, num lugar só — eles são API pública (links colados). */
const P = {
  camada: 'camada',
  ano: 'ano',
  cidade: 'cidade',
  versus: 'vs',
} as const

export interface EstadoDaBancada {
  /** Chave da camada corrente. Sempre válida: chave desconhecida cai no repouso. */
  chave: string
  /** `null` = o plano inteiro. */
  ano: number | null
  /** A cidade do cartão. `null` = nenhum cartão aberto. */
  cidade: string | null
  /** A cidade FIXADA para comparação. `null` = comparando com ninguém. */
  versus: string | null
  escolherCamada: (chave: string) => void
  escolherAno: (ano: number | null) => void
  abrirCidade: (cidade: string) => void
  fecharCartao: () => void
  compararCom: (cidade: string | null) => void
}

export function useEstadoDaBancada(): EstadoDaBancada {
  const [params, setParams] = useSearchParams()

  /**
   * Um único ponto de escrita, e ele NUNCA lê `params` da closure.
   *
   * A forma de função de `setSearchParams` entrega os parâmetros correntes —
   * e é o que impede o defeito clássico deste padrão: dois `set` no mesmo tick
   * (abrir a cidade e trocar a camada, por exemplo) partiriam os dois da mesma
   * cópia velha e o segundo apagaria o primeiro.
   */
  const escrever = useCallback(
    (mudancas: Partial<Record<keyof typeof P, string | null>>, empilhar: boolean) => {
      setParams(
        (atuais) => {
          const proximos = new URLSearchParams(atuais)
          for (const [campo, valor] of Object.entries(mudancas)) {
            const nome = P[campo as keyof typeof P]
            // Parâmetro vazio é parâmetro que some: `?cidade=` na barra de
            // endereço é ruído que o usuário lê e não entende.
            if (valor == null || valor === '') proximos.delete(nome)
            else proximos.set(nome, valor)
          }
          return proximos
        },
        { replace: !empilhar },
      )
    },
    [setParams],
  )

  const bruta = params.get(P.camada)
  // Chave desconhecida (link de uma versão anterior, ou digitada errado) cai no
  // repouso em vez de quebrar a tela — a URL é entrada de usuário como
  // qualquer outra.
  const chave = bruta && CAMADA_POR_CHAVE.has(bruta) ? bruta : REPOUSO

  const anoBruto = Number(params.get(P.ano))
  const ano = Number.isFinite(anoBruto) && anoBruto > 0 ? anoBruto : null

  const cidade = params.get(P.cidade)
  const versusBruto = params.get(P.versus)
  // Comparar uma cidade com ela mesma é um estado que só nasce de link
  // adulterado, e desenharia duas séries idênticas sobrepostas.
  const versus = versusBruto && versusBruto !== cidade ? versusBruto : null

  const escolherCamada = useCallback(
    (nova: string) => escrever({ camada: nova === REPOUSO ? null : nova }, false),
    [escrever],
  )

  const escolherAno = useCallback(
    (novo: number | null) => escrever({ ano: novo == null ? null : String(novo) }, false),
    [escrever],
  )

  /**
   * Abrir OUTRA cidade com um cartão já aberto não empilha: é a mesma leitura
   * andando de município em município (o que as setas do teclado fazem), e não
   * uma entrada nova. Só a PRIMEIRA abertura empilha, para que "voltar" feche.
   */
  const abrirCidade = useCallback(
    (nova: string) => escrever({ cidade: nova }, cidade == null),
    [escrever, cidade],
  )

  const fecharCartao = useCallback(
    () => escrever({ cidade: null, versus: null }, true),
    [escrever],
  )

  const compararCom = useCallback(
    (outra: string | null) => escrever({ versus: outra }, false),
    [escrever],
  )

  return useMemo(
    () => ({
      chave,
      ano,
      cidade,
      versus,
      escolherCamada,
      escolherAno,
      abrirCidade,
      fecharCartao,
      compararCom,
    }),
    [
      chave,
      ano,
      cidade,
      versus,
      escolherCamada,
      escolherAno,
      abrirCidade,
      fecharCartao,
      compararCom,
    ],
  )
}

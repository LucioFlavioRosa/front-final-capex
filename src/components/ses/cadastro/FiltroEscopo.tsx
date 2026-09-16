/**
 * A BARRA DE ESCOPO — empresa + sistema (+ cidade, nas abas do Município), acima
 * da grade de toda aba que declara os eixos (`AbaDef.escopo`).
 *
 * Ela é a barra que vivia dentro de `Unifilar.tsx`, extraída sem mudar um pixel:
 * mesmo rótulo em maiúsculas de 11px, mesmo `Combobox` com busca, mesma largura
 * mínima de 220px. O que mudou é quem manda — o estado subiu para o
 * `CadastroWizard`, porque na aba do Fluxo o mesmo par de controles recorta a
 * TABELA e escolhe o DESENHO, e dois donos discordariam.
 *
 * TRÊS REGRAS DE QUANDO ELA APARECE, e as três são contra poluição de tela:
 *
 *   1. a aba declara o eixo. Sem declaração, sem controle.
 *   2. o eixo tem 2+ valores distintos. Um `<select>` com uma opção só é
 *      decoração — a lista já vem das linhas da aba (ver `opcoesEscopo`), então
 *      "1 opção" quer dizer "não há o que escolher".
 *   3. quem decide o mínimo de linhas é o chamador (`MIN_LINHAS_PARA_ESCOPO`),
 *      pela mesma razão de `MIN_LINHAS_PARA_FILTRO` no funil de coluna: em aba
 *      que se lê inteira de uma vez, filtrar é mais trabalho que ler.
 */

import { X } from '@phosphor-icons/react'
import { Combobox } from '../../ui/Combobox'
import { type Escopo, type OpcoesEscopo, cidadesVisiveis, sistemasVisiveis } from '../../../domain/escopo'

interface Props {
  opcoes: OpcoesEscopo
  escopo: Escopo
  onEscopo: (e: Escopo) => void
}

/** Menos que isto e o par de eixos tem uma opção só — nada a escolher. */
const MIN_OPCOES = 2

export function FiltroEscopo({ opcoes, escopo, onEscopo }: Props) {
  const sistemas = sistemasVisiveis(opcoes, escopo.empresaId)
  const cidades = cidadesVisiveis(opcoes, escopo.empresaId)

  const temEmpresa = opcoes.empresas.length >= MIN_OPCOES
  const temSistema = opcoes.sistemas.length >= MIN_OPCOES
  // A cidade tem o "todas" na lista, então o mínimo conta as cidades REAIS.
  const temCidade = opcoes.cidades.filter((c) => c.value).length >= MIN_OPCOES
  if (!temEmpresa && !temSistema && !temCidade) return null


  /**
   * TROCAR DE EMPRESA PODE INVALIDAR O SISTEMA ESCOLHIDO — ele pode não ser
   * operado pela empresa nova. Limpar o sistema junto é o que evita a tela
   * mostrar "0 linhas" logo depois de um clique que devia MOSTRAR algo.
   */
  function trocarEmpresa(empresaId: string) {
    // A CIDADE SEGUE A MESMA REGRA, com uma diferença: ela tem "todas", então a
    // cidade que não é da empresa nova volta para "todas" em vez de pular para
    // outra — trocar de município sem ninguém pedir seria pior que mostrar todos.
    const cidadeVale = !empresaId || !escopo.cidadeId
      || opcoes.cidades.some((c) => c.value === escopo.cidadeId && c.empresa === empresaId)
    const cidadeId = cidadeVale ? escopo.cidadeId : ''
    const aindaVale = !empresaId || !escopo.sistemaId
      || opcoes.sistemas.some((s) => s.value === escopo.sistemaId && s.empresas.has(empresaId))
    if (aindaVale) return onEscopo({ empresaId, sistemaId: escopo.sistemaId, cidadeId })
    // O SISTEMA ANTERIOR NÃO É DESTA EMPRESA — troca para o primeiro dela, em vez
    // de esvaziar. Esvaziar deixava a barra num estado que a lista não oferece
    // (não há "todos os sistemas") e a grade voltava a montar tudo, calada.
    const primeiro = sistemasVisiveis(opcoes, empresaId).find((s) => s.value)?.value ?? ''
    onEscopo({ empresaId, sistemaId: primeiro, cidadeId })
  }

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      {temEmpresa && (
        <Campo rotulo="Empresa">
          <Combobox options={opcoes.empresas} value={escopo.empresaId} onChange={trocarEmpresa} />
        </Campo>
      )}
      {temSistema && (
        <Campo rotulo="Sistema">
          <Combobox
            options={sistemas}
            value={escopo.sistemaId}
            onChange={(sistemaId) => onEscopo({ ...escopo, sistemaId })}
          />
        </Campo>
      )}
      {temCidade && (
        <Campo rotulo="Cidade">
          <Combobox
            options={cidades}
            value={escopo.cidadeId ?? ''}
            onChange={(cidadeId) => onEscopo({ ...escopo, cidadeId })}
          />
        </Campo>
      )}

      {/* SEM CONTADOR AQUI — o rodapé da grade já mostra "84 de 1.047", e ele é o
          número CERTO: soma o recorte da barra com os filtros de coluna. Um
          segundo contador contando só metade discordaria do primeiro. */}
      {/* LIMPA A EMPRESA E A CIDADE, e não o recorte inteiro: não há "todos os
          sistemas" (ver `opcoesEscopo`), então zerar o sistema deixaria a barra
          num estado que a lista não oferece — e a grade voltaria a montar tudo.
          Some quando não há nada escolhido nos dois, porque aí não há o que
          limpar. */}
      {(escopo.empresaId || escopo.cidadeId) && (
        <button
          type="button"
          onClick={() => onEscopo({ ...escopo, empresaId: '', cidadeId: '' })}
          className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-water-50 px-3 py-1.5 text-[12.5px] font-semibold text-water-700 transition-colors duration-hover ease-saida hover:bg-water-100"
        >
          <X weight="bold" className="text-[11px]" />
          {escopo.cidadeId ? 'Limpar cidade' : 'Limpar empresa'}
        </button>
      )}
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-[220px]">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-ink-water">
        {rotulo}
      </span>
      {children}
    </label>
  )
}

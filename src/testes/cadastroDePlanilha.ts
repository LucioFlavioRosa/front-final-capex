import type { UnidadeState } from '@/data/cadastroUnidade/types'

/**
 * UMA UNIDADE PEQUENA E COMPLETA para os testes da planilha: uma cidade com
 * empresa, dois sistemas (o segundo vazio), uma sub-bacia (duas obras), uma
 * ETE, uma CTS colocada (uma obra) e uma CTS livre COM FICHA E OBRA — como o
 * servidor a serve com `incluirLivres`. É o suficiente para cada estratégia da
 * mescla ter uma linha para casar, para a colocação da CTS ter onde entrar, e
 * para a regra da macrorregião ter o que contar.
 *
 * Os números vêm no formato em que a tela os guarda (pt-BR estrito), porque a
 * ida e volta pelo Excel é justamente o que se quer provar.
 */
export function unidadeDeTeste(usaMacro = false): UnidadeState {
  return {
    id: 'uT1',
    name: 'Unidade Teste',
    regionalName: 'Regional Teste',
    cidades: [{ id: 'c1', name: 'Cidade Um' }, { id: 'c2', name: 'Cidade Dois' }],
    data: {
      'unidade-regional': [
        {
          regional_id: 'rT', regional_name: 'Regional Teste', diretoria_id: 'dT', diretoria_name: 'Diretoria',
          unidade_id: 'uT1', unidade_name: 'Unidade Teste', wacc_medio: '0,0873',
          usa_macrorregiao_cts: usaMacro ? 'Sim' : 'Nao',
        },
      ],
      'regional-operacional': [{ regional_id: 'rT', ano_base: '' }],
      'empresa': [{ unidade_id: 'uT1', emp_codigo: '57', empresa: 'Empresa 57', data_fim_concessao: '2048' }],
      'cidade-empresa': [{ emp_codigo: '57', empresa: 'Empresa 57', cidade_id: 'c1', cidade_name: 'Cidade Um' }],
      'cidade-sistema': [
        { emp_codigo: '', empresa: '', sistema_id: 's1', sistema_name: 'Sistema Um', cidade_id: 'c1' },
        { emp_codigo: '', empresa: '', sistema_id: 's2', sistema_name: 'Sistema Dois', cidade_id: 'c1' },
      ],
      'cidade-operacional': [
        { emp_codigo: '57', empresa: 'Empresa 57', cidade_id: 'c1', cidade_name: 'Cidade Um' },
        // SEM meta nem faixa: é a cidade que ganha linha-modelo no arquivo
        { emp_codigo: '57', empresa: 'Empresa 57', cidade_id: 'c2', cidade_name: 'Cidade Dois' },
      ],
      'metas-cobertura': [
        { emp_codigo: '57', empresa: 'Empresa 57', cidade_id: 'c1', cidade_name: 'Cidade Um', ano: '2030', cobertura_pct: '80' },
        { emp_codigo: '57', empresa: 'Empresa 57', cidade_id: 'c1', cidade_name: 'Cidade Um', ano: '2035', cobertura_pct: '90' },
      ],
      'fator-esgoto': [
        { emp_codigo: '57', empresa: 'Empresa 57', cidade_id: 'c1', cidade_name: 'Cidade Um', cobertura_pct: '0', paridade: '1' },
      ],
      'ete-capex': [
        {
          ete_id: 'e1', ete_name: 'ETE Um', sistema_id: 's1', capacidade_por_modulo: '50', capex_por_modulo: '1.500.000',
          opex_por_modulo: '12.000', tempo_de_execucao: '24', capacidade_nominal_atual: '100', vazao_de_operacao_atual: '60',
          nova: 'Não', capex_terreno: '', modulos: '2', wacc: '', capacidade_ociosa: '40',
          tempo_predecessoras: '0', obra_obrigatoria_ano: '0', obra_proibida_ate: '0',
        },
      ],
      'sistema-topologia': [
        {
          sistema_id: 's1', sistema_name: 'Sistema Um', componente_sistema_id: 'b1', componente_sistema_nome: 'Sub-bacia Um',
          componente_tipo: 'subbacia', componente_sistema_id_jusante: 'e1', componente_sistema_nome_jusante: 'ETE Um',
        },
        {
          sistema_id: 's1', sistema_name: 'Sistema Um', componente_sistema_id: 'e1', componente_sistema_nome: 'ETE Um',
          componente_tipo: 'ete', componente_sistema_id_jusante: '', componente_sistema_nome_jusante: '',
        },
        {
          sistema_id: 's1', sistema_name: 'Sistema Um', componente_sistema_id: 'cts_001', componente_sistema_nome: 'CTS 001',
          componente_tipo: 'cts', componente_sistema_id_jusante: 'b1', componente_sistema_nome_jusante: 'Sub-bacia Um',
        },
        {
          sistema_id: '', sistema_name: '', componente_sistema_id: 'cts_002', componente_sistema_nome: 'CTS 002',
          componente_tipo: 'cts', cidade_id: 'c1', macro: 'Nao', emp_codigo: '57',
          componente_sistema_id_jusante: '', componente_sistema_nome_jusante: '',
        },
      ],
      'subbacia-operacional': [
        {
          sistema_id: 's1', sistema_name: 'Sistema Um', sub_bacia_id: 'b1', sub_bacia_name: 'Sub-bacia Um',
          receita_faturada_media_mensal: '32.034,8', ligacoes_atuais: '140', universo_ligacoes: '406',
          preco_por_ligacao: '1.026,89', tempo_arrecadacao: '2', tempo_ramp_up: '5', vazao_contribuicao: '20,6',
          universo_populacao: '', populacao_atual: '', potencial_crescimento: '1,15', ticket_medio: '191,29',
        },
      ],
      'componentes-subbacias-capex': [
        {
          sub_bacia_id: 'b1', sub_bacia_name: 'Sub-bacia Um', sistema_id: 's1', sistema_name: 'Sistema Um',
          componente: 'Rede coletora', quantidade: '319', unidade: 'm', preco_unitario: '1.277,65', capex: '',
          opex: '12.227,11', tempo_predecessoras: '0', tempo_execucao: '12', obra_obrigatoria_ano: '0', obra_proibida_ate: '0', wacc: '',
        },
        {
          sub_bacia_id: 'b1', sub_bacia_name: 'Sub-bacia Um', sistema_id: 's1', sistema_name: 'Sistema Um',
          componente: 'Ligacao de esgoto', quantidade: '266', unidade: 'ligacao', preco_unitario: '2.931,01', capex: '',
          opex: '23.389,46', tempo_predecessoras: '0', tempo_execucao: '12', obra_obrigatoria_ano: '2032', obra_proibida_ate: '0', wacc: '',
        },
      ],
      'subbacia-cts': [],
      'cts-operacional': [
        {
          emp_codigo: '57', empresa: 'Empresa 57', sistema_id: 's1', sistema_name: 'Sistema Um', cts_id: 'cts_001', cts_name: 'CTS 001',
          receita_faturada_media_mensal: '5.000', ligacoes_atuais: '40', universo_ligacoes: '100',
          preco_por_ligacao: '900', tempo_arrecadacao: '2', tempo_ramp_up: '5', vazao_contribuicao: '4,36',
          universo_populacao: '', populacao_atual: '', potencial_crescimento: '1,1', ticket_medio: '125',
          sistema_cts: '', qtd_coletores: '', coletores: '',
        },
        // A CTS LIVRE: ficha da origem, sistema em branco — a planilha a traz
        // para preencher e para receber o sistema.
        {
          emp_codigo: '57', empresa: 'Empresa 57', sistema_id: '', sistema_name: '', cts_id: 'cts_002', cts_name: 'CTS 002',
          receita_faturada_media_mensal: '3.000', ligacoes_atuais: '20', universo_ligacoes: '80',
          preco_por_ligacao: '', tempo_arrecadacao: '2', tempo_ramp_up: '5', vazao_contribuicao: '2,1',
          universo_populacao: '', populacao_atual: '', potencial_crescimento: '1,1', ticket_medio: '150',
          sistema_cts: '', qtd_coletores: '', coletores: '',
        },
      ],
      'componentes-cts-capex': [
        {
          cts_id: 'cts_001', cts_name: 'CTS 001', componente: 'Coletor de tempo seco', quantidade: '60', unidade: 'ligacao',
          preco_unitario: '2.931,01', capex: '', opex: '1.000', tempo_predecessoras: '0', tempo_execucao: '12',
          obra_obrigatoria_ano: '0', obra_proibida_ate: '0', wacc: '0,09',
        },
        {
          cts_id: 'cts_002', cts_name: 'CTS 002', componente: 'Coletor de tempo seco', quantidade: '', unidade: 'ligacao',
          preco_unitario: '', capex: '', opex: '', tempo_predecessoras: '0', tempo_execucao: '12',
          obra_obrigatoria_ano: '0', obra_proibida_ate: '0', wacc: '',
        },
      ],
    },
  }
}

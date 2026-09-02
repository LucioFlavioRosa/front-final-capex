/**
 * Dicionario de dados (aba "02 Dicionario de Dados" da planilha, exposto no
 * prototipo como objeto DICT). Copy FINAL — extraido do Cadastro de Dados.dc.html
 * (linhas 834-851). Chave = nome tecnico da coluna.
 */
export interface Verbete {
  rotulo: string
  tec: string
  origem: string
  tipo: string
  oque: string
  porque: string
  exemplo: string
}

export const DICT: Record<string, Verbete> = {
  preco_por_ligacao: {
    rotulo: 'Taxa de ligação',
    tec: 'preco_por_ligacao',
    origem: 'você preenche',
    tipo: 'R$ por ligação (uma vez)',
    oque: 'Taxa cobrada uma única vez ao conectar o cliente, sempre POR LIGAÇÃO.',
    porque: 'Vira receita indireta no ano da conexão.',
    exemplo: '784',
  },
  tempo_arrecadacao: {
    rotulo: 'Início da arrecadação',
    tec: 'tempo_arrecadacao',
    origem: 'você preenche',
    tipo: 'meses',
    oque: 'Tempo entre a obra ficar pronta e a sub-bacia começar a faturar.',
    porque: 'Atrasa o início da receita (lag) no cálculo do VPL.',
    exemplo: '6',
  },
  tempo_ramp_up: {
    rotulo: 'Rampa de adesão',
    tec: 'tempo_ramp_up',
    origem: 'você preenche',
    tipo: 'meses',
    oque: 'Tempo até a adesão plena dos clientes após o início do faturamento.',
    porque:
      'A receita cresce em curva S (lenta–pico–lenta) até o pleno neste prazo; o OPEX sobe no mesmo período.',
    exemplo: '12',
  },
  vazao_contribuicao: {
    rotulo: 'Vazão nova',
    tec: 'vazao_contribuicao',
    origem: 'você preenche',
    tipo: 'vazão · mesma unidade da ETE',
    oque: 'A vazão NOVA que a sub-bacia passa a mandar quando conectada — não a vazão já existente. É o TOTAL: residencial mais industrial.',
    porque:
      'Dimensiona os módulos da ETE e é o peso do rateio das obras compartilhadas. Errar aqui distorce quem paga o quê. A parcela industrial está em `vazao_contribuicao_industrial`, já contida neste número.',
    exemplo: '165,9',
  },
  vazao_contribuicao_industrial: {
    rotulo: 'Vazão nova industrial',
    tec: 'vazao_contribuicao_industrial',
    origem: 'você preenche · 0 quando não há indústria',
    tipo: 'vazão · parcela já contida na vazão nova',
    oque: 'Quanto da vazão nova vem da indústria. NÃO é um número a somar: `vazao_contribuicao` já é o total, e este diz quanto daquele total é industrial.',
    porque:
      'A rodada de simulação escolhe se considera a indústria. COM indústria: usa a vazão total como está. SEM indústria: residencial = total − industrial. Exemplo: 165,9 L/s de vazão nova, 12,4 industriais → com indústria usa 165,9; só residencial, 165,9 − 12,4 = 153,5. Sem indústria na área, informe 0 — vazio não é resposta.',
    exemplo: '12,4 (de 165,9 L/s)',
  },
  potencial_crescimento: {
    rotulo: 'Potencial de crescimento',
    tec: 'potencial_crescimento',
    origem: 'você preenche',
    tipo: 'fator ≥ 1,0 · default 1,0',
    oque: 'Multiplicador do universo de ligações da sub-bacia. 1,0 = sem crescimento; 1,5 = universo 50% maior.',
    porque: 'Amplia SÓ o denominador da meta de cobertura.',
    exemplo: '1,0',
  },
  quantidade: {
    rotulo: 'Quantidade',
    tec: 'quantidade',
    origem: 'você preenche',
    tipo: 'número, na unidade da obra',
    oque: 'Quanto será construído do componente (ex.: 2.472 m de rede, 38 ligações).',
    porque: 'CAPEX = quantidade × preço unitário. Dá rastreabilidade ao investimento.',
    exemplo: '2.472',
  },
  opex: {
    rotulo: 'OPEX',
    tec: 'opex',
    origem: 'você preenche',
    tipo: 'R$ por ano',
    oque: 'Custo de operar a obra, por ano, depois de pronta. Informe o valor MÁXIMO (todas as ligações faturando).',
    porque:
      'Obra ociosa não gera OPEX; a operação sobe de forma côncava até o máximo no tempo de rampa.',
    exemplo: '49.847',
  },
  tempo_predecessoras: {
    rotulo: 'Após predecessoras',
    tec: 'tempo_predecessoras',
    origem: 'você preenche',
    tipo: 'meses',
    oque: 'Espera entre as obras que vêm antes ficarem prontas e esta poder começar.',
    porque:
      'É assim que a sequência é montada: a simulação escolhe o ano de cada obra, mas respeita a ordem física. 0 = pode começar junto.',
    exemplo: '4',
  },
  tempo_de_execucao: {
    rotulo: 'Tempo de execução',
    tec: 'tempo_de_execucao',
    origem: 'você preenche',
    tipo: 'meses',
    oque: 'Quanto dura a construção desta obra, do início à entrega.',
    porque: 'Define quando a obra passa a atender e a gerar receita.',
    exemplo: '9',
  },
  // Mesmo conceito de `tempo_de_execucao`, sob a chave usada nas abas de CAPEX
  // de rede e de CTS (o SCHEMA separou as duas por aba — ver schema.ts).
  tempo_execucao: {
    rotulo: 'Duração da execução',
    tec: 'tempo_execucao',
    origem: 'você preenche',
    tipo: 'meses',
    oque: 'Quanto dura a construção desta obra, do início à entrega.',
    porque: 'Define quando a obra passa a atender e a gerar receita.',
    exemplo: '9',
  },
  obra_obrigatoria_ano: {
    rotulo: 'Obrigatória em',
    tec: 'obra_obrigatoria_ano',
    origem: 'você preenche · sempre com valor',
    tipo: '0 · -1 · ano (AAAA)',
    oque: '0 = a obra não é obrigatória, a simulação decide se entra. -1 = é obrigatória, mas em qualquer ano — a simulação escolhe quando. AAAA = é obrigatória naquele ano exato.',
    porque:
      'Amarra compromisso já assumido (TAC, licença, ordem de serviço). Com 0 a obra concorre pelo retorno como as outras; com -1 ela entra em algum momento; com o ano, a simulação perde a escolha.',
    exemplo: '2027',
  },
  obra_proibida_ate: {
    rotulo: 'Proibida até',
    tec: 'obra_proibida_ate',
    origem: 'você preenche · sempre com valor',
    tipo: '0 · ano (AAAA)',
    oque: '0 = sem impedimento. AAAA = a obra não pode COMEÇAR até esse ano.',
    porque:
      'Trava obra que depende de licença, desapropriação ou de outra frente. A simulação só pode começá-la depois do ano informado.',
    exemplo: '2026',
  },
  wacc: {
    rotulo: 'WACC da obra',
    tec: 'wacc',
    origem: 'você preenche · opcional',
    tipo: 'fração (0 a 1)',
    oque: 'Custo de capital do componente, quando há financiamento nominalmente atrelado.',
    porque:
      'Desconta CAPEX e OPEX da obra. Vazio = usa o WACC médio da unidade (Operações Financeiras).',
    exemplo: '0,091',
  },
  data_fim_concessao: {
    rotulo: 'Fim da concessão',
    tec: 'data_fim_concessao',
    origem: 'você preenche',
    tipo: 'ano (AAAA)',
    oque: 'Ano-calendário do fim da concessão da cidade.',
    porque: 'Define até quando a receita entra no VPL. Depois disso, nada é contado.',
    exemplo: '2045',
  },
  // ─── Recorte industrial ───────────────────────────────────────────────────
  // Os quatro verbetes repetem a mesma regra de propósito: ela é a fonte do
  // erro clássico (somar industrial ao total) e quem abre um deles pode não
  // abrir os outros.
  universo_ligacoes_industrial: {
    rotulo: 'Ligações industriais — universo',
    tec: 'universo_ligacoes_industrial',
    origem: 'Databricks 🔒 · corrigível com override',
    tipo: 'ligações · parcela já contida no total',
    oque: 'Quantas ligações do universo são industriais. NÃO é um número a somar: `universo_ligacoes` já é o total (residencial + industrial), e esta coluna diz quanto daquele total é indústria.',
    porque:
      'A rodada de simulação escolhe se considera a indústria. COM indústria: usa o total como está. SEM indústria: residencial = total − industrial. Exemplo: 1.000 ligações no universo, 80 industriais → com indústria usa 1.000; só residencial, 1.000 − 80 = 920.',
    exemplo: '80 (de um universo de 1.000)',
  },
  ligacoes_atuais_industrial: {
    rotulo: 'Ligações industriais atuais',
    tec: 'ligacoes_atuais_industrial',
    origem: 'Databricks 🔒 · corrigível com override',
    tipo: 'ligações · parcela já contida no total',
    oque: 'Quantas das ligações já atendidas hoje são industriais. Parcela de `ligacoes_atuais`, não um acréscimo a ele.',
    porque:
      'Mesma regra do universo: com indústria, vale o total; só residencial, subtrai-se esta parcela. Somar os dois inflaria a cobertura atual e a meta pareceria mais perto do que está.',
    exemplo: '28 (de 1.318 atuais)',
  },
  receita_faturada_industrial: {
    rotulo: 'Receita faturada industrial',
    tec: 'receita_faturada_industrial',
    origem: 'Databricks 🔒 · corrigível com override',
    tipo: 'R$/mês · parcela já contida no total',
    oque: 'Quanto da receita faturada dos últimos 12 meses veio da indústria. É recorte de `receita_faturada`, não uma receita à parte.',
    porque:
      'Indústria costuma ser pouca ligação com fatia grande da receita — é o que explica um ticket alto. Se a rodada rodar só residencial, esta parcela sai do total; somá-la contaria a mesma receita duas vezes.',
    exemplo: '36.535 (de 260.964 faturados)',
  },
  receita_arrecadada_industrial: {
    rotulo: 'Receita arrecadada industrial',
    tec: 'receita_arrecadada_industrial',
    origem: 'Databricks 🔒 · corrigível com override',
    tipo: 'R$/mês · parcela já contida no total',
    oque: 'Quanto da receita efetivamente arrecadada veio da indústria. Recorte de `receita_arrecadada`.',
    porque:
      'Junto com a faturada, mostra a inadimplência da categoria. Vale a mesma regra: com indústria usa-se o total; só residencial, total − industrial.',
    exemplo: '29.630 (de 211.642 arrecadados)',
  },

  universo_populacao: {
    rotulo: 'População — universo',
    tec: 'universo_populacao',
    origem: 'você preenche · só quando a rodada mede por população',
    tipo: 'habitantes',
    oque: 'Toda a população da área da sub-bacia, atendida ou não por esgoto.',
    porque:
      'É o denominador da meta quando a rodada mede cobertura por população. Sem ele não dá para verificar o percentual contratado.',
    exemplo: '1.267',
  },
  populacao_atual: {
    rotulo: 'População atendida hoje',
    tec: 'populacao_atual',
    origem: 'você preenche · só quando a rodada mede por população',
    tipo: 'habitantes',
    oque: 'População que já tem coleta de esgoto, antes das obras deste plano.',
    porque:
      'É o numerador de partida da meta. A diferença para o universo é a população que as obras precisam atender.',
    exemplo: '406',
  },
  cobertura_pct: {
    rotulo: 'Cobertura %',
    tec: 'cobertura_pct',
    origem: 'você preenche',
    tipo: '% (0 a 100)',
    oque: 'Percentual do universo que deve estar atendido naquele ano.',
    porque:
      'O alvo em quantidade = % × universo, medido na régua da cidade. Metas fora do horizonte de CAPEX são ignoradas.',
    exemplo: '48',
  },
  paridade: {
    rotulo: 'Paridade',
    tec: 'paridade',
    origem: 'você preenche',
    tipo: 'fração · tipicamente 0,8 a 1,0',
    oque: 'Quanto a tarifa de esgoto representa da tarifa de água naquela faixa de cobertura.',
    porque:
      'tarifa_esgoto = ticket (água) × paridade. Quando a cobertura sobe de faixa, o reajuste vale também para a base existente.',
    exemplo: '0,80 / 0,85 / … / 1,00',
  },
  componente_sistema_id_jusante: {
    rotulo: 'Escoa para',
    tec: 'componente_sistema_id_jusante',
    origem: 'Databricks 🔒',
    tipo: 'texto (código)',
    oque: 'Para ONDE esta sub-bacia escoa: outra sub-bacia ou a ETE.',
    porque:
      'COLUNA MAIS CRÍTICA DA BASE. Define o caminho até a ETE e quais obras liberam a receita. Um erro aqui libera receita sem infraestrutura.',
    exemplo: 'e1',
  },
  capacidade_por_modulo: {
    rotulo: 'Capacidade por módulo',
    tec: 'capacidade_por_modulo',
    origem: 'você preenche',
    tipo: 'vazão',
    oque: 'Vazão que cada módulo da ETE trata.',
    porque: 'Define quantos módulos são necessários para a vazão conectada.',
    exemplo: '49',
  },
  capex_terreno: {
    rotulo: 'Custo de terreno e estrutura de fim de plano',
    tec: 'capex_terreno',
    origem: 'você preenche · só ETE nova',
    tipo: 'R$',
    oque: 'Custo do terreno da ETE nova.',
    porque: 'ETE nova é um pacote único: terreno + módulos.',
    exemplo: '912.405',
  },
  modulos: {
    rotulo: 'Nº de módulos',
    tec: 'modulos',
    origem: 'você preenche · só ETE nova',
    tipo: 'quantidade',
    oque: 'Número de módulos da ETE nova.',
    porque: 'Define a capacidade total do pacote (teto de vazão).',
    exemplo: '4',
  },
}

/** Cor do chip de origem no painel: Databricks = cyan, usuario = ambar. */
export function origemStyle(origem: string): {
  background: string
  color: string
  borderColor: string
} {
  return origem.includes('Databricks')
    ? { background: 'var(--db-bg)', color: 'var(--db-text-2)', borderColor: 'var(--db-border)' }
    : {
        background: 'var(--pend-bg)',
        color: 'var(--pend-text-3)',
        borderColor: 'var(--pend-border-2)',
      }
}

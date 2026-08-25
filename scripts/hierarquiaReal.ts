/**
 * Hierarquia real regional → unidade → cidade, gerada de
 * `DEPARA_REGIONAL_EMP_CODIGO_EMPRSA_CIDADE.csv`:
 * 5 regionais, 52 unidades, 715 cidades.
 *
 * Gerado por scripts/gerar-hierarquia.mjs — não editar à mão.
 * Para regenerar: node scripts/gerar-hierarquia.mjs
 *
 * OCULTAS por decisão de exibição, e por isso os totais acima não batem com o
 * CSV: EMP_CODIGO 58. Ver `UNIDADES_OCULTAS` no gerador.
 *
 * `unidade_id` é o EMP_CODIGO da empresa operadora — o mesmo código que
 * aparece em CTS_DADOS_COMERCIAIS.csv e que permite, pela primeira vez,
 * recortar a base comercial de CTS por unidade (56 = ÁGUAS DO RIO 01,
 * 57 = ÁGUAS DO RIO 04, ambas na regional R4).
 *
 * O que este CSV NÃO traz, e por isso continua sem fonte no cadastro:
 *   - nome descritivo da regional — só existe o código (R1…R5), então
 *     `regional_name` recebe o próprio código, não um nome inventado;
 *   - o nível de SUPERINTENDÊNCIA — o de-para pula de empresa direto para
 *     cidade (ver o placeholder em seed.ts);
 *   - sistema e sub-bacia — nada; as 1.047 sub-bacias seguem sem recorte
 *     por unidade (ver ANALISE-CSV-DADOS-COMERCIAIS.md).
 *
 * MOVIDO de `src/data/cadastroUnidade/` para `scripts/` em 17/08/2026. O front
 * não compila mais este arquivo: a lista de regionais/unidades que a tela usa
 * vem de `/api/regionais` e `/api/regionais/{id}/unidades`, lidas de
 * `input.unidade_regional` no banco. Este arquivo continua existindo como
 * INSUMO de carga — é dele que `seed.ts`/`semear-banco.ts` tiram o de-para
 * para popular o banco local — mas nenhum arquivo de `src/` o importa.
 */
import type { Cidade, UnidadeOption } from '../src/data/cadastroUnidade/types'

export const REGIONAIS_REAIS: string[] = ["R1","R2","R3","R4","R5"]

export const UNIDADES_POR_REGIONAL_REAL: Record<string, UnidadeOption[]> = {
  "R1": [
    {
      "id": "61",
      "nome": "ÁGUAS DE VALADARES"
    },
    {
      "id": "2",
      "nome": "ÁGUAS GUARIROBA S.A."
    },
    {
      "id": "32",
      "nome": "NX - AGUAS DE CONFRESA"
    },
    {
      "id": "35",
      "nome": "NX - ÁGUAS DE DIAMANTINO"
    },
    {
      "id": "37",
      "nome": "NX - ÁGUAS DE GUARANTÃ"
    },
    {
      "id": "36",
      "nome": "NX - ÁGUAS DE MATUPA"
    },
    {
      "id": "38",
      "nome": "NX - ÁGUAS DE NOVO PROGRESSO"
    },
    {
      "id": "42",
      "nome": "NX - ÁGUAS DE PARANATINGA"
    },
    {
      "id": "39",
      "nome": "NX - ÁGUAS DE SINOP"
    },
    {
      "id": "30",
      "nome": "NX - BARRA DO GARÇAS"
    },
    {
      "id": "9",
      "nome": "NX - CAMPO VERDE"
    },
    {
      "id": "28",
      "nome": "NX - CARLINDA"
    },
    {
      "id": "27",
      "nome": "NX - CLAUDIA"
    },
    {
      "id": "10",
      "nome": "NX - JANGADA"
    },
    {
      "id": "11",
      "nome": "NX - JAURU"
    },
    {
      "id": "12",
      "nome": "NX - MARCELÂNDIA"
    },
    {
      "id": "13",
      "nome": "NX - NORTELÂNDIA"
    },
    {
      "id": "14",
      "nome": "NX - PEDRA PRETA"
    },
    {
      "id": "15",
      "nome": "NX - PEIXOTO DE AZEVEDO"
    },
    {
      "id": "7",
      "nome": "NX - POCONE"
    },
    {
      "id": "29",
      "nome": "NX - PORTO ESPERIDIÃO"
    },
    {
      "id": "16",
      "nome": "NX - PRIMAVERA DO LESTE"
    },
    {
      "id": "8",
      "nome": "NX - SANTA CARMEM"
    },
    {
      "id": "17",
      "nome": "NX - SÃO JOSÉ DO RIO CLARO"
    },
    {
      "id": "18",
      "nome": "NX - SORRISO"
    },
    {
      "id": "19",
      "nome": "NX - UNIÃO DO SUL"
    },
    {
      "id": "20",
      "nome": "NX - VERA"
    }
  ],
  "R2": [
    {
      "id": "47",
      "nome": "ÁGUAS DE BOMBINHAS"
    },
    {
      "id": "43",
      "nome": "ÁGUAS DE CAMBORIÚ"
    },
    {
      "id": "44",
      "nome": "ÁGUAS DE HOLAMBRA"
    },
    {
      "id": "31",
      "nome": "ÁGUAS DE MATÃO"
    },
    {
      "id": "34",
      "nome": "ÁGUAS DE PENHA"
    },
    {
      "id": "40",
      "nome": "ÁGUAS DE SÃO FRANCISCO DO SUL"
    },
    {
      "id": "3",
      "nome": "PROLAGOS"
    }
  ],
  "R3": [
    {
      "id": "45",
      "nome": "ÁGUAS DE BURITIS"
    },
    {
      "id": "60",
      "nome": "ÁGUAS DE JARU"
    },
    {
      "id": "51",
      "nome": "ÁGUAS DE MANAUS"
    },
    {
      "id": "33",
      "nome": "AGUAS DE SÃO FRANCISCO"
    },
    {
      "id": "49",
      "nome": "ÁGUAS DE TERESINA"
    },
    {
      "id": "41",
      "nome": "ÁGUAS DE TIMON"
    },
    {
      "id": "64",
      "nome": "ÁGUAS DO PARÁ A"
    },
    {
      "id": "65",
      "nome": "ÁGUAS DO PARÁ B"
    },
    {
      "id": "66",
      "nome": "ÁGUAS DO PARÁ C"
    },
    {
      "id": "67",
      "nome": "ÁGUAS DO PARÁ D"
    },
    {
      "id": "63",
      "nome": "ÁGUAS DO PIAUÍ"
    },
    {
      "id": "48",
      "nome": "NX - ÁGUAS DE ARIQUEMES"
    },
    {
      "id": "50",
      "nome": "NX - ÁGUAS DE ROLIM DE MOURA"
    },
    {
      "id": "46",
      "nome": "NX - PIMENTA BUENO"
    }
  ],
  "R4": [
    {
      "id": "56",
      "nome": "ÁGUAS DO RIO 01"
    },
    {
      "id": "57",
      "nome": "ÁGUAS DO RIO 04"
    }
  ],
  "R5": [
    {
      "id": "62",
      "nome": "ÁGUAS DE PALHOÇA"
    },
    {
      "id": "59",
      "nome": "CORSAN"
    }
  ]
}

export const CIDADES_POR_UNIDADE: Record<string, Cidade[]> = {
  "2": [
    {
      "id": "c001",
      "name": "ANHANDUI"
    },
    {
      "id": "c002",
      "name": "CAMPO GRANDE"
    },
    {
      "id": "c003",
      "name": "ROCHEDINHO"
    }
  ],
  "3": [
    {
      "id": "c001",
      "name": "ARMACAO DOS BUZIOS"
    },
    {
      "id": "c002",
      "name": "ARRAIAL DO CABO"
    },
    {
      "id": "c003",
      "name": "CABO FRIO"
    },
    {
      "id": "c004",
      "name": "CABO FRIO - TAMOIOS"
    },
    {
      "id": "c005",
      "name": "IGUABA GRANDE"
    },
    {
      "id": "c006",
      "name": "SAO PEDRO DA ALDEIA"
    }
  ],
  "7": [
    {
      "id": "c001",
      "name": "POCONE"
    }
  ],
  "8": [
    {
      "id": "c001",
      "name": "SANTA CARMEM"
    }
  ],
  "9": [
    {
      "id": "c001",
      "name": "CAMPO VERDE"
    }
  ],
  "10": [
    {
      "id": "c001",
      "name": "JANGADA"
    }
  ],
  "11": [
    {
      "id": "c001",
      "name": "JAURU"
    }
  ],
  "12": [
    {
      "id": "c001",
      "name": "MARCELANDIA"
    }
  ],
  "13": [
    {
      "id": "c001",
      "name": "NORTELANDIA"
    }
  ],
  "14": [
    {
      "id": "c001",
      "name": "PEDRA PRETA"
    }
  ],
  "15": [
    {
      "id": "c001",
      "name": "PEIXOTO DE AZEVEDO"
    }
  ],
  "16": [
    {
      "id": "c001",
      "name": "PRIMAVERA"
    }
  ],
  "17": [
    {
      "id": "c001",
      "name": "SAO JOSE DO RIO CLARO"
    }
  ],
  "18": [
    {
      "id": "c001",
      "name": "SORRISO"
    }
  ],
  "19": [
    {
      "id": "c001",
      "name": "UNIAO DO SUL"
    }
  ],
  "20": [
    {
      "id": "c001",
      "name": "VERA"
    }
  ],
  "27": [
    {
      "id": "c001",
      "name": "CLAUDIA"
    }
  ],
  "28": [
    {
      "id": "c001",
      "name": "CARLINDA"
    }
  ],
  "29": [
    {
      "id": "c001",
      "name": "PORTO ESPERIDIAO"
    }
  ],
  "30": [
    {
      "id": "c001",
      "name": "BARRA DO GARÇAS"
    }
  ],
  "31": [
    {
      "id": "c001",
      "name": "MATAO"
    }
  ],
  "32": [
    {
      "id": "c001",
      "name": "CONFRESA"
    }
  ],
  "33": [
    {
      "id": "c001",
      "name": "BARCARENA"
    }
  ],
  "34": [
    {
      "id": "c001",
      "name": "NAVEGANTES"
    },
    {
      "id": "c002",
      "name": "PENHA"
    }
  ],
  "35": [
    {
      "id": "c001",
      "name": "DIAMANTINO"
    }
  ],
  "36": [
    {
      "id": "c001",
      "name": "MATUPA"
    }
  ],
  "37": [
    {
      "id": "c001",
      "name": "GUARANTA"
    }
  ],
  "38": [
    {
      "id": "c001",
      "name": "NOVO PROGRESSO"
    }
  ],
  "39": [
    {
      "id": "c001",
      "name": "SINOP"
    }
  ],
  "40": [
    {
      "id": "c001",
      "name": "S.FRANCISCO DO SUL"
    }
  ],
  "41": [
    {
      "id": "c001",
      "name": "TIMON"
    }
  ],
  "42": [
    {
      "id": "c001",
      "name": "PARANATINGA"
    }
  ],
  "43": [
    {
      "id": "c001",
      "name": "CAMBORIU"
    }
  ],
  "44": [
    {
      "id": "c001",
      "name": "HOLAMBRA"
    }
  ],
  "45": [
    {
      "id": "c001",
      "name": "BURITIS"
    }
  ],
  "46": [
    {
      "id": "c001",
      "name": "PIMENTA BUENO"
    }
  ],
  "47": [
    {
      "id": "c001",
      "name": "BOMBINHAS"
    }
  ],
  "48": [
    {
      "id": "c001",
      "name": "ARIQUEMES"
    }
  ],
  "49": [
    {
      "id": "c001",
      "name": "TERESINA"
    }
  ],
  "50": [
    {
      "id": "c001",
      "name": "ROLIM DE MOURA"
    }
  ],
  "51": [
    {
      "id": "c001",
      "name": "MANAUS"
    }
  ],
  "56": [
    {
      "id": "c001",
      "name": "APERIBE"
    },
    {
      "id": "c002",
      "name": "CACHOEIRAS DE MACACU"
    },
    {
      "id": "c003",
      "name": "CAMBUCI"
    },
    {
      "id": "c004",
      "name": "CANTAGALO"
    },
    {
      "id": "c005",
      "name": "CASIMIRO DE ABREU"
    },
    {
      "id": "c006",
      "name": "CORDEIRO"
    },
    {
      "id": "c007",
      "name": "DUAS BARRAS"
    },
    {
      "id": "c008",
      "name": "ITABORAI"
    },
    {
      "id": "c009",
      "name": "ITAOCARA"
    },
    {
      "id": "c010",
      "name": "MAGE"
    },
    {
      "id": "c011",
      "name": "MARICA"
    },
    {
      "id": "c012",
      "name": "MIRACEMA"
    },
    {
      "id": "c013",
      "name": "RIO BONITO"
    },
    {
      "id": "c014",
      "name": "RIO DE JANEIRO"
    },
    {
      "id": "c015",
      "name": "S.FCO.DO ITABAPOANA"
    },
    {
      "id": "c016",
      "name": "S.SEBASTIAO DO ALTO"
    },
    {
      "id": "c017",
      "name": "SAO GONCALO"
    },
    {
      "id": "c018",
      "name": "SAQUAREMA"
    },
    {
      "id": "c019",
      "name": "TANGUA"
    }
  ],
  "57": [
    {
      "id": "c001",
      "name": "BELFORD ROXO"
    },
    {
      "id": "c002",
      "name": "DUQUE DE CAXIAS"
    },
    {
      "id": "c003",
      "name": "JAPERI"
    },
    {
      "id": "c004",
      "name": "MESQUITA"
    },
    {
      "id": "c005",
      "name": "NILOPOLIS"
    },
    {
      "id": "c006",
      "name": "NOVA IGUAÇU"
    },
    {
      "id": "c007",
      "name": "QUEIMADOS"
    },
    {
      "id": "c008",
      "name": "RIO DE JANEIRO - A"
    },
    {
      "id": "c009",
      "name": "RIO DE JANEIRO - B"
    },
    {
      "id": "c010",
      "name": "SAO JOAO DE MERITI"
    }
  ],
  "59": [
    {
      "id": "c001",
      "name": "ACEGUA"
    },
    {
      "id": "c002",
      "name": "AGUA SANTA"
    },
    {
      "id": "c003",
      "name": "AGUDO"
    },
    {
      "id": "c004",
      "name": "AJURICABA"
    },
    {
      "id": "c005",
      "name": "ALECRIM"
    },
    {
      "id": "c006",
      "name": "ALEGRETE"
    },
    {
      "id": "c007",
      "name": "ALPESTRE"
    },
    {
      "id": "c008",
      "name": "ALTO ALEGRE"
    },
    {
      "id": "c009",
      "name": "ALVORADA"
    },
    {
      "id": "c010",
      "name": "AMARAL FERRADOR"
    },
    {
      "id": "c011",
      "name": "AMETISTA DO SUL"
    },
    {
      "id": "c012",
      "name": "ANTONIO PRADO"
    },
    {
      "id": "c013",
      "name": "ARAMBARE"
    },
    {
      "id": "c014",
      "name": "ARATIBA"
    },
    {
      "id": "c015",
      "name": "ARROIO DO MEIO"
    },
    {
      "id": "c016",
      "name": "ARROIO DO SAL"
    },
    {
      "id": "c017",
      "name": "ARROIO DO TIGRE"
    },
    {
      "id": "c018",
      "name": "ARROIO DOS RATOS"
    },
    {
      "id": "c019",
      "name": "ARROIO GRANDE"
    },
    {
      "id": "c020",
      "name": "ARVOREZINHA"
    },
    {
      "id": "c021",
      "name": "AUREA"
    },
    {
      "id": "c022",
      "name": "BALNEARIO PINHAL"
    },
    {
      "id": "c023",
      "name": "BARAO"
    },
    {
      "id": "c024",
      "name": "BARAO DE COTEGIPE"
    },
    {
      "id": "c025",
      "name": "BARAO DO TRIUNFO"
    },
    {
      "id": "c026",
      "name": "BARRA DO GUARITA"
    },
    {
      "id": "c027",
      "name": "BARRA DO QUARAI"
    },
    {
      "id": "c028",
      "name": "BARRA DO RIBEIRO"
    },
    {
      "id": "c029",
      "name": "BARRACAO"
    },
    {
      "id": "c030",
      "name": "BARROS CASSAL"
    },
    {
      "id": "c031",
      "name": "BENTO GONCALVES"
    },
    {
      "id": "c032",
      "name": "BOA VISTA DO BURICA"
    },
    {
      "id": "c033",
      "name": "BOM JESUS"
    },
    {
      "id": "c034",
      "name": "BOM PROGRESSO"
    },
    {
      "id": "c035",
      "name": "BOM RETIRO DO SUL"
    },
    {
      "id": "c036",
      "name": "BOQUEIRAO DO LEAO"
    },
    {
      "id": "c037",
      "name": "BOSSOROCA"
    },
    {
      "id": "c038",
      "name": "BRAGA"
    },
    {
      "id": "c039",
      "name": "BUTIA"
    },
    {
      "id": "c040",
      "name": "CACAPAVA DO SUL"
    },
    {
      "id": "c041",
      "name": "CACEQUI"
    },
    {
      "id": "c042",
      "name": "CACHOEIRA DO SUL"
    },
    {
      "id": "c043",
      "name": "CACHOEIRINHA"
    },
    {
      "id": "c044",
      "name": "CACIQUE DOBLE"
    },
    {
      "id": "c045",
      "name": "CAIBATE"
    },
    {
      "id": "c046",
      "name": "CAICARA"
    },
    {
      "id": "c047",
      "name": "CAMAQUA"
    },
    {
      "id": "c048",
      "name": "CAMBARA DO SUL"
    },
    {
      "id": "c049",
      "name": "CAMPESTRE DA SERRA"
    },
    {
      "id": "c050",
      "name": "CAMPINA DAS MISSOES"
    },
    {
      "id": "c051",
      "name": "CAMPINAS DO SUL"
    },
    {
      "id": "c052",
      "name": "CAMPO BOM"
    },
    {
      "id": "c053",
      "name": "CAMPO NOVO"
    },
    {
      "id": "c054",
      "name": "CAMPOS BORGES"
    },
    {
      "id": "c055",
      "name": "CANDELARIA"
    },
    {
      "id": "c056",
      "name": "CANDIDO GODOY"
    },
    {
      "id": "c057",
      "name": "CANELA"
    },
    {
      "id": "c058",
      "name": "CANGUÇU"
    },
    {
      "id": "c059",
      "name": "CANOAS"
    },
    {
      "id": "c060",
      "name": "CAPAO DA CANOA"
    },
    {
      "id": "c061",
      "name": "CAPAO DO LEAO"
    },
    {
      "id": "c062",
      "name": "CAPELA DE SANTANA"
    },
    {
      "id": "c063",
      "name": "CAPIVARI DO SUL"
    },
    {
      "id": "c064",
      "name": "CARAZINHO"
    },
    {
      "id": "c065",
      "name": "CARLOS BARBOSA"
    },
    {
      "id": "c066",
      "name": "CASCA"
    },
    {
      "id": "c067",
      "name": "CASEIROS"
    },
    {
      "id": "c068",
      "name": "CATUIPE"
    },
    {
      "id": "c069",
      "name": "CERRITO"
    },
    {
      "id": "c070",
      "name": "CERRO GRANDE DO SUL"
    },
    {
      "id": "c071",
      "name": "CERRO LARGO"
    },
    {
      "id": "c072",
      "name": "CHAPADA"
    },
    {
      "id": "c073",
      "name": "CHARQUEADAS"
    },
    {
      "id": "c074",
      "name": "CHIAPETTA"
    },
    {
      "id": "c075",
      "name": "CHUI"
    },
    {
      "id": "c076",
      "name": "CHUVISCA"
    },
    {
      "id": "c077",
      "name": "CIDREIRA"
    },
    {
      "id": "c078",
      "name": "CIRIACO"
    },
    {
      "id": "c079",
      "name": "COLORADO"
    },
    {
      "id": "c080",
      "name": "CONDOR"
    },
    {
      "id": "c081",
      "name": "CONSTANTINA"
    },
    {
      "id": "c082",
      "name": "CORONEL BICACO"
    },
    {
      "id": "c083",
      "name": "COTIPORA"
    },
    {
      "id": "c084",
      "name": "CRISSIUMAL"
    },
    {
      "id": "c085",
      "name": "CRISTAL"
    },
    {
      "id": "c086",
      "name": "CRUZ ALTA"
    },
    {
      "id": "c087",
      "name": "CRUZEIRO DO SUL"
    },
    {
      "id": "c088",
      "name": "DAVID CANABARRO"
    },
    {
      "id": "c089",
      "name": "DERRUBADAS"
    },
    {
      "id": "c090",
      "name": "DILERMANDO DE AGUIAR"
    },
    {
      "id": "c091",
      "name": "DOIS IRMAOS"
    },
    {
      "id": "c092",
      "name": "DOM FELICIANO"
    },
    {
      "id": "c093",
      "name": "DOM PEDRITO"
    },
    {
      "id": "c094",
      "name": "DONA FRANCISCA"
    },
    {
      "id": "c095",
      "name": "ELDORADO DO SUL"
    },
    {
      "id": "c096",
      "name": "ENCANTADO"
    },
    {
      "id": "c097",
      "name": "ENCRUZILHADA DO SUL"
    },
    {
      "id": "c098",
      "name": "ENTRE IJUIS"
    },
    {
      "id": "c099",
      "name": "ENTRE RIOS DO SUL"
    },
    {
      "id": "c100",
      "name": "EREBANGO"
    },
    {
      "id": "c101",
      "name": "ERECHIM"
    },
    {
      "id": "c102",
      "name": "ERVAL GRANDE"
    },
    {
      "id": "c103",
      "name": "ERVAL SECO"
    },
    {
      "id": "c104",
      "name": "ESMERALDA"
    },
    {
      "id": "c105",
      "name": "ESPUMOSO"
    },
    {
      "id": "c106",
      "name": "ESTACAO"
    },
    {
      "id": "c107",
      "name": "ESTANCIA VELHA"
    },
    {
      "id": "c108",
      "name": "ESTEIO"
    },
    {
      "id": "c109",
      "name": "ESTRELA"
    },
    {
      "id": "c110",
      "name": "FAGUNDES VARELA"
    },
    {
      "id": "c111",
      "name": "FARROUPILHA"
    },
    {
      "id": "c112",
      "name": "FAXINAL DO SOTURNO"
    },
    {
      "id": "c113",
      "name": "FAXINALZINHO"
    },
    {
      "id": "c114",
      "name": "FELIZ"
    },
    {
      "id": "c115",
      "name": "FLORES DA CUNHA"
    },
    {
      "id": "c116",
      "name": "FONTOURA XAVIER"
    },
    {
      "id": "c117",
      "name": "FORMIGUEIRO"
    },
    {
      "id": "c118",
      "name": "FORTALEZA DOS VALOS"
    },
    {
      "id": "c119",
      "name": "FREDERICO WESTPHALEN"
    },
    {
      "id": "c120",
      "name": "GARIBALDI"
    },
    {
      "id": "c121",
      "name": "GAURAMA"
    },
    {
      "id": "c122",
      "name": "GENERAL CAMARA"
    },
    {
      "id": "c123",
      "name": "GETULIO VARGAS"
    },
    {
      "id": "c124",
      "name": "GIRUA"
    },
    {
      "id": "c125",
      "name": "GLORINHA"
    },
    {
      "id": "c126",
      "name": "GRAMADO"
    },
    {
      "id": "c127",
      "name": "GRAVATAI"
    },
    {
      "id": "c128",
      "name": "GUAIBA"
    },
    {
      "id": "c129",
      "name": "GUAPORE"
    },
    {
      "id": "c130",
      "name": "GUARANI DAS MISSOES"
    },
    {
      "id": "c131",
      "name": "HERVAL"
    },
    {
      "id": "c132",
      "name": "HORIZONTINA"
    },
    {
      "id": "c133",
      "name": "HUMAITA"
    },
    {
      "id": "c134",
      "name": "IBIACA"
    },
    {
      "id": "c135",
      "name": "IBIRAIARAS"
    },
    {
      "id": "c136",
      "name": "IBIRUBA"
    },
    {
      "id": "c137",
      "name": "IGREJINHA"
    },
    {
      "id": "c138",
      "name": "IJUI"
    },
    {
      "id": "c139",
      "name": "ILOPOLIS"
    },
    {
      "id": "c140",
      "name": "IMBE"
    },
    {
      "id": "c141",
      "name": "INDEPENDENCIA"
    },
    {
      "id": "c142",
      "name": "INHACORÁ"
    },
    {
      "id": "c143",
      "name": "IPE"
    },
    {
      "id": "c144",
      "name": "IRAI"
    },
    {
      "id": "c145",
      "name": "ITAARA"
    },
    {
      "id": "c146",
      "name": "ITAPUCA"
    },
    {
      "id": "c147",
      "name": "ITAQUI"
    },
    {
      "id": "c148",
      "name": "ITATIBA DO SUL"
    },
    {
      "id": "c149",
      "name": "IVORA"
    },
    {
      "id": "c150",
      "name": "JABOTICABA"
    },
    {
      "id": "c151",
      "name": "JACUTINGA"
    },
    {
      "id": "c152",
      "name": "JAGUARAO"
    },
    {
      "id": "c153",
      "name": "JAGUARI"
    },
    {
      "id": "c154",
      "name": "JAQUIRANA"
    },
    {
      "id": "c155",
      "name": "JULIO DE CASTILHOS"
    },
    {
      "id": "c156",
      "name": "LAGOA BONITA DO SUL"
    },
    {
      "id": "c157",
      "name": "LAGOA VERMELHA"
    },
    {
      "id": "c158",
      "name": "LAGOAO"
    },
    {
      "id": "c159",
      "name": "LAJEADO"
    },
    {
      "id": "c160",
      "name": "LAVRAS DO SUL"
    },
    {
      "id": "c161",
      "name": "LIBERATO SALZANO"
    },
    {
      "id": "c162",
      "name": "MAÇAMBARÁ"
    },
    {
      "id": "c163",
      "name": "MACHADINHO"
    },
    {
      "id": "c164",
      "name": "MANOEL VIANA"
    },
    {
      "id": "c165",
      "name": "MARAU"
    },
    {
      "id": "c166",
      "name": "MARCELINO RAMOS"
    },
    {
      "id": "c167",
      "name": "MARIANA PIMENTEL"
    },
    {
      "id": "c168",
      "name": "MARIANO MORO"
    },
    {
      "id": "c169",
      "name": "MARQUES DE SOUZA"
    },
    {
      "id": "c170",
      "name": "MATA"
    },
    {
      "id": "c171",
      "name": "MAURICIO CARDOSO"
    },
    {
      "id": "c172",
      "name": "MAXIMILIANO DE ALMEIDA"
    },
    {
      "id": "c173",
      "name": "MINAS DO LEAO"
    },
    {
      "id": "c174",
      "name": "MIRAGUAI"
    },
    {
      "id": "c175",
      "name": "MONTENEGRO"
    },
    {
      "id": "c176",
      "name": "MORRO REDONDO"
    },
    {
      "id": "c177",
      "name": "MORRO REUTER"
    },
    {
      "id": "c178",
      "name": "MOSTARDAS"
    },
    {
      "id": "c179",
      "name": "MUITOS CAPOES"
    },
    {
      "id": "c180",
      "name": "NAO-ME-TOQUE"
    },
    {
      "id": "c181",
      "name": "NONOAI"
    },
    {
      "id": "c182",
      "name": "NOVA ARACA"
    },
    {
      "id": "c183",
      "name": "NOVA BASSANO"
    },
    {
      "id": "c184",
      "name": "NOVA BRESCIA"
    },
    {
      "id": "c185",
      "name": "NOVA ESPERANCA DO SUL"
    },
    {
      "id": "c186",
      "name": "NOVA HARTZ"
    },
    {
      "id": "c187",
      "name": "NOVA PALMA"
    },
    {
      "id": "c188",
      "name": "NOVA PETROPOLIS"
    },
    {
      "id": "c189",
      "name": "NOVA PRATA"
    },
    {
      "id": "c190",
      "name": "NOVA ROMA DO SUL"
    },
    {
      "id": "c191",
      "name": "NOVA SANTA RITA"
    },
    {
      "id": "c192",
      "name": "OSORIO"
    },
    {
      "id": "c193",
      "name": "PAIM FILHO"
    },
    {
      "id": "c194",
      "name": "PALMARES DO SUL"
    },
    {
      "id": "c195",
      "name": "PALMEIRA DAS MISSOES"
    },
    {
      "id": "c196",
      "name": "PALMITINHO"
    },
    {
      "id": "c197",
      "name": "PANAMBI"
    },
    {
      "id": "c198",
      "name": "PANTANO GRANDE"
    },
    {
      "id": "c199",
      "name": "PARAI"
    },
    {
      "id": "c200",
      "name": "PAROBE"
    },
    {
      "id": "c201",
      "name": "PASSA SETE"
    },
    {
      "id": "c202",
      "name": "PASSO FUNDO"
    },
    {
      "id": "c203",
      "name": "PAVERAMA"
    },
    {
      "id": "c204",
      "name": "PEDRAS ALTAS"
    },
    {
      "id": "c205",
      "name": "PEDRO OSORIO"
    },
    {
      "id": "c206",
      "name": "PEJUCARA"
    },
    {
      "id": "c207",
      "name": "PINHEIRINHO DO VALE"
    },
    {
      "id": "c208",
      "name": "PINHEIRO MACHADO"
    },
    {
      "id": "c209",
      "name": "PINTO BANDEIRA"
    },
    {
      "id": "c210",
      "name": "PIRATINI"
    },
    {
      "id": "c211",
      "name": "PLANALTO"
    },
    {
      "id": "c212",
      "name": "PORTAO"
    },
    {
      "id": "c213",
      "name": "PORTO LUCENA"
    },
    {
      "id": "c214",
      "name": "PORTO XAVIER"
    },
    {
      "id": "c215",
      "name": "PUTINGA"
    },
    {
      "id": "c216",
      "name": "QUARAI"
    },
    {
      "id": "c217",
      "name": "REDENTORA"
    },
    {
      "id": "c218",
      "name": "RESTINGA SECA"
    },
    {
      "id": "c219",
      "name": "RIO DOS INDIOS"
    },
    {
      "id": "c220",
      "name": "RIO GRANDE"
    },
    {
      "id": "c221",
      "name": "RIO PARDO"
    },
    {
      "id": "c222",
      "name": "RIOZINHO"
    },
    {
      "id": "c223",
      "name": "ROCA SALES"
    },
    {
      "id": "c224",
      "name": "RODEIO BONITO"
    },
    {
      "id": "c225",
      "name": "ROLANTE"
    },
    {
      "id": "c226",
      "name": "RONDA ALTA"
    },
    {
      "id": "c227",
      "name": "RONDINHA"
    },
    {
      "id": "c228",
      "name": "ROSARIO DO SUL"
    },
    {
      "id": "c229",
      "name": "SALTO DO JACUI"
    },
    {
      "id": "c230",
      "name": "SALVADOR DO SUL"
    },
    {
      "id": "c231",
      "name": "SANANDUVA"
    },
    {
      "id": "c232",
      "name": "SANTA BARBARA DO SUL"
    },
    {
      "id": "c233",
      "name": "SANTA CRUZ DO SUL"
    },
    {
      "id": "c234",
      "name": "SANTA MARGARIDA DO SUL"
    },
    {
      "id": "c235",
      "name": "SANTA MARIA"
    },
    {
      "id": "c236",
      "name": "SANTA MARIA DO HERVAL"
    },
    {
      "id": "c237",
      "name": "SANTA ROSA"
    },
    {
      "id": "c238",
      "name": "SANTA VITORIA DO PALMAR"
    },
    {
      "id": "c239",
      "name": "SANTANA DA BOA VISTA"
    },
    {
      "id": "c240",
      "name": "SANTIAGO"
    },
    {
      "id": "c241",
      "name": "SANTO ANGELO"
    },
    {
      "id": "c242",
      "name": "SANTO ANTONIO DA PATRULHA"
    },
    {
      "id": "c243",
      "name": "SANTO ANTONIO DAS MISSOES"
    },
    {
      "id": "c244",
      "name": "SANTO AUGUSTO"
    },
    {
      "id": "c245",
      "name": "SANTO CRISTO"
    },
    {
      "id": "c246",
      "name": "SANTO EXPEDITO DO SUL"
    },
    {
      "id": "c247",
      "name": "SAO BORJA"
    },
    {
      "id": "c248",
      "name": "SAO FRANCISCO DE ASSIS"
    },
    {
      "id": "c249",
      "name": "SAO FRANCISCO DE PAULA"
    },
    {
      "id": "c250",
      "name": "SAO JERONIMO"
    },
    {
      "id": "c251",
      "name": "SAO JOAO DA URTIGA"
    },
    {
      "id": "c252",
      "name": "SAO JORGE"
    },
    {
      "id": "c253",
      "name": "SAO JOSE DO HERVAL"
    },
    {
      "id": "c254",
      "name": "SAO JOSE DO INHACORA"
    },
    {
      "id": "c255",
      "name": "SAO JOSE DO NORTE"
    },
    {
      "id": "c256",
      "name": "SAO JOSE DO OURO"
    },
    {
      "id": "c257",
      "name": "SAO JOSE DOS AUSENTES"
    },
    {
      "id": "c258",
      "name": "SAO LOURENCO DO SUL"
    },
    {
      "id": "c259",
      "name": "SAO LUIZ GONZAGA"
    },
    {
      "id": "c260",
      "name": "SAO MARCOS"
    },
    {
      "id": "c261",
      "name": "SAO MARTINHO"
    },
    {
      "id": "c262",
      "name": "SAO MIGUEL DAS MISSOES"
    },
    {
      "id": "c263",
      "name": "SAO NICOLAU"
    },
    {
      "id": "c264",
      "name": "SAO PEDRO DA SERRA"
    },
    {
      "id": "c265",
      "name": "SAO PEDRO DO SUL"
    },
    {
      "id": "c266",
      "name": "SAO SEBASTIAO DO CAI"
    },
    {
      "id": "c267",
      "name": "SAO SEPE"
    },
    {
      "id": "c268",
      "name": "SAO VALENTIM"
    },
    {
      "id": "c269",
      "name": "SAO VICENTE DO SUL"
    },
    {
      "id": "c270",
      "name": "SAPIRANGA"
    },
    {
      "id": "c271",
      "name": "SAPUCAIA DO SUL"
    },
    {
      "id": "c272",
      "name": "SARANDI"
    },
    {
      "id": "c273",
      "name": "SEBERI"
    },
    {
      "id": "c274",
      "name": "SEDE NOVA"
    },
    {
      "id": "c275",
      "name": "SELBACH"
    },
    {
      "id": "c276",
      "name": "SENTINELA DO SUL"
    },
    {
      "id": "c277",
      "name": "SERAFINA CORREA"
    },
    {
      "id": "c278",
      "name": "SERTAO"
    },
    {
      "id": "c279",
      "name": "SERTAO SANTANA"
    },
    {
      "id": "c280",
      "name": "SEVERIANO DE ALMEIDA"
    },
    {
      "id": "c281",
      "name": "SILVEIRA MARTINS"
    },
    {
      "id": "c282",
      "name": "SOBRADINHO"
    },
    {
      "id": "c283",
      "name": "SOLEDADE"
    },
    {
      "id": "c284",
      "name": "TAPEJARA"
    },
    {
      "id": "c285",
      "name": "TAPERA"
    },
    {
      "id": "c286",
      "name": "TAPES"
    },
    {
      "id": "c287",
      "name": "TAQUARA"
    },
    {
      "id": "c288",
      "name": "TAQUARI"
    },
    {
      "id": "c289",
      "name": "TAQUARUCU DO SUL"
    },
    {
      "id": "c290",
      "name": "TAVARES"
    },
    {
      "id": "c291",
      "name": "TENENTE PORTELA"
    },
    {
      "id": "c292",
      "name": "TERRA DE AREIA"
    },
    {
      "id": "c293",
      "name": "TIRADENTES DO SUL"
    },
    {
      "id": "c294",
      "name": "TORRES"
    },
    {
      "id": "c295",
      "name": "TRAMANDAI"
    },
    {
      "id": "c296",
      "name": "TRES CACHOEIRAS"
    },
    {
      "id": "c297",
      "name": "TRES COROAS"
    },
    {
      "id": "c298",
      "name": "TRES DE MAIO"
    },
    {
      "id": "c299",
      "name": "TRES PASSOS"
    },
    {
      "id": "c300",
      "name": "TRINDADE DO SUL"
    },
    {
      "id": "c301",
      "name": "TRIUNFO"
    },
    {
      "id": "c302",
      "name": "TUCUNDUVA"
    },
    {
      "id": "c303",
      "name": "TUPANCIRETA"
    },
    {
      "id": "c304",
      "name": "TUPARENDI"
    },
    {
      "id": "c305",
      "name": "UNISTALDA"
    },
    {
      "id": "c306",
      "name": "VACARIA"
    },
    {
      "id": "c307",
      "name": "VENANCIO AIRES"
    },
    {
      "id": "c308",
      "name": "VERANOPOLIS"
    },
    {
      "id": "c309",
      "name": "VIADUTOS"
    },
    {
      "id": "c310",
      "name": "VIAMAO"
    },
    {
      "id": "c311",
      "name": "VICENTE DUTRA"
    },
    {
      "id": "c312",
      "name": "VICTOR GRAEFF"
    },
    {
      "id": "c313",
      "name": "VILA FLORES"
    },
    {
      "id": "c314",
      "name": "VILA NOVA DO SUL"
    },
    {
      "id": "c315",
      "name": "VISTA ALEGRE"
    },
    {
      "id": "c316",
      "name": "VISTA GAUCHA"
    },
    {
      "id": "c317",
      "name": "XANGRI-LA"
    }
  ],
  "60": [
    {
      "id": "c001",
      "name": "JARU"
    }
  ],
  "61": [
    {
      "id": "c001",
      "name": "GOVERNADOR VALADARES"
    }
  ],
  "62": [
    {
      "id": "c001",
      "name": "PALHOCA"
    }
  ],
  "63": [
    {
      "id": "c001",
      "name": "ACAUA"
    },
    {
      "id": "c002",
      "name": "AGRICOLANDIA"
    },
    {
      "id": "c003",
      "name": "AGUA BRANCA"
    },
    {
      "id": "c004",
      "name": "ALAGOINHA DO PIAUI"
    },
    {
      "id": "c005",
      "name": "ALEGRETE DO PIAUI"
    },
    {
      "id": "c006",
      "name": "ALTO LONGA"
    },
    {
      "id": "c007",
      "name": "ALTOS"
    },
    {
      "id": "c008",
      "name": "ALVORADA DO GURGUEIA"
    },
    {
      "id": "c009",
      "name": "AMARANTE"
    },
    {
      "id": "c010",
      "name": "ANGICAL DO PIAUI"
    },
    {
      "id": "c011",
      "name": "ANISIO DE ABREU"
    },
    {
      "id": "c012",
      "name": "AROAZES"
    },
    {
      "id": "c013",
      "name": "AROEIRAS DO ITAIM"
    },
    {
      "id": "c014",
      "name": "ARRAIAL"
    },
    {
      "id": "c015",
      "name": "ASSUNCAO DO PIAUI"
    },
    {
      "id": "c016",
      "name": "AVELINO LOPES"
    },
    {
      "id": "c017",
      "name": "BAIXA GRANDE DO RIBEIRO"
    },
    {
      "id": "c018",
      "name": "BARRA D ALCANTARA"
    },
    {
      "id": "c019",
      "name": "BARRAS"
    },
    {
      "id": "c020",
      "name": "BARREIRAS DO PIAUI"
    },
    {
      "id": "c021",
      "name": "BARRO DURO"
    },
    {
      "id": "c022",
      "name": "BATALHA"
    },
    {
      "id": "c023",
      "name": "BELA VISTA DO PIAUI"
    },
    {
      "id": "c024",
      "name": "BELEM DO PIAUI"
    },
    {
      "id": "c025",
      "name": "BENEDITINOS"
    },
    {
      "id": "c026",
      "name": "BERTOLINIA"
    },
    {
      "id": "c027",
      "name": "BETANIA DO PIAUI"
    },
    {
      "id": "c028",
      "name": "BOA HORA"
    },
    {
      "id": "c029",
      "name": "BOCAINA"
    },
    {
      "id": "c030",
      "name": "BOM JESUS"
    },
    {
      "id": "c031",
      "name": "BOM PRINCIPIO DO PIAUI"
    },
    {
      "id": "c032",
      "name": "BONFIM DO PIAUI"
    },
    {
      "id": "c033",
      "name": "BOQUEIRAO DO PIAUI"
    },
    {
      "id": "c034",
      "name": "BRASILEIRA"
    },
    {
      "id": "c035",
      "name": "BREJO DO PIAUI"
    },
    {
      "id": "c036",
      "name": "BURITI DOS LOPES"
    },
    {
      "id": "c037",
      "name": "BURITI DOS MONTES"
    },
    {
      "id": "c038",
      "name": "CABECEIRAS  DO PIAUI"
    },
    {
      "id": "c039",
      "name": "CAJAZEIRAS DO PIAUI"
    },
    {
      "id": "c040",
      "name": "CAJUEIRO DA PRAIA"
    },
    {
      "id": "c041",
      "name": "CALDEIRAO GRANDE DO PIAUI"
    },
    {
      "id": "c042",
      "name": "CAMPINAS DO PIAUI"
    },
    {
      "id": "c043",
      "name": "CAMPO ALEGRE DO FIDALGO"
    },
    {
      "id": "c044",
      "name": "CAMPO GRANDE DO PIAUI"
    },
    {
      "id": "c045",
      "name": "CAMPO LARGO DO PIAUI"
    },
    {
      "id": "c046",
      "name": "CANAVIEIRA"
    },
    {
      "id": "c047",
      "name": "CANTO DO BURITI"
    },
    {
      "id": "c048",
      "name": "CAPITAO DE CAMPOS"
    },
    {
      "id": "c049",
      "name": "CAPITAO GERVASIO OLIVEIRA"
    },
    {
      "id": "c050",
      "name": "CARACOL"
    },
    {
      "id": "c051",
      "name": "CARAUBAS DO PIAUI"
    },
    {
      "id": "c052",
      "name": "CARIDADE"
    },
    {
      "id": "c053",
      "name": "CASTELO DO PIAUI"
    },
    {
      "id": "c054",
      "name": "COCAL"
    },
    {
      "id": "c055",
      "name": "COCAL DE TELHA"
    },
    {
      "id": "c056",
      "name": "COCAL DOS ALVES"
    },
    {
      "id": "c057",
      "name": "COIVARAS"
    },
    {
      "id": "c058",
      "name": "COLONIA DO GURGUEIA"
    },
    {
      "id": "c059",
      "name": "COLONIA DO PIAUI"
    },
    {
      "id": "c060",
      "name": "CONCEICAO DO CANINDE"
    },
    {
      "id": "c061",
      "name": "CORONEL JOSE DIAS"
    },
    {
      "id": "c062",
      "name": "CORRENTE"
    },
    {
      "id": "c063",
      "name": "CRISTALANDIA"
    },
    {
      "id": "c064",
      "name": "CRISTINO CASTRO"
    },
    {
      "id": "c065",
      "name": "CURIMATA"
    },
    {
      "id": "c066",
      "name": "CURRAIS"
    },
    {
      "id": "c067",
      "name": "CURRAL NOVO PI"
    },
    {
      "id": "c068",
      "name": "CURRALINHOS"
    },
    {
      "id": "c069",
      "name": "DEMERVAL LOBAO"
    },
    {
      "id": "c070",
      "name": "DIRCEU ARCOVERDE"
    },
    {
      "id": "c071",
      "name": "DOM EXPEDITO LOPES"
    },
    {
      "id": "c072",
      "name": "DOM INOCENCIO"
    },
    {
      "id": "c073",
      "name": "DOMINGOS MOURAO"
    },
    {
      "id": "c074",
      "name": "ELESBAO VELOSO"
    },
    {
      "id": "c075",
      "name": "ELIZEU MARTINS"
    },
    {
      "id": "c076",
      "name": "ESPERANTINA"
    },
    {
      "id": "c077",
      "name": "FARTURA DO PIAUI"
    },
    {
      "id": "c078",
      "name": "FLORES DO PIAUI"
    },
    {
      "id": "c079",
      "name": "FLORESTA DO PIAUI"
    },
    {
      "id": "c080",
      "name": "FLORIANO"
    },
    {
      "id": "c081",
      "name": "FRANCINOPOLIS"
    },
    {
      "id": "c082",
      "name": "FRANCISCO AIRES"
    },
    {
      "id": "c083",
      "name": "FRANCISCO MACEDO"
    },
    {
      "id": "c084",
      "name": "FRANCISCO SANTOS"
    },
    {
      "id": "c085",
      "name": "FRONTEIRAS"
    },
    {
      "id": "c086",
      "name": "GEMINIANO"
    },
    {
      "id": "c087",
      "name": "GILBUES"
    },
    {
      "id": "c088",
      "name": "GUADALUPE"
    },
    {
      "id": "c089",
      "name": "GUARIBAS"
    },
    {
      "id": "c090",
      "name": "HUGO NAPOLEAO"
    },
    {
      "id": "c091",
      "name": "ILHA GRANDE"
    },
    {
      "id": "c092",
      "name": "INHUMA"
    },
    {
      "id": "c093",
      "name": "IPIRANGA"
    },
    {
      "id": "c094",
      "name": "ISAIAS COELHO"
    },
    {
      "id": "c095",
      "name": "ITAINOPOLIS"
    },
    {
      "id": "c096",
      "name": "ITAUEIRA"
    },
    {
      "id": "c097",
      "name": "JACOBINA DO PIAUI"
    },
    {
      "id": "c098",
      "name": "JAICOS"
    },
    {
      "id": "c099",
      "name": "JARDIM MULATO"
    },
    {
      "id": "c100",
      "name": "JATOBA DO PIAUI"
    },
    {
      "id": "c101",
      "name": "JERUMENHA"
    },
    {
      "id": "c102",
      "name": "JOAO COSTA"
    },
    {
      "id": "c103",
      "name": "JOAQUIM PIRES"
    },
    {
      "id": "c104",
      "name": "JOCA MARQUES"
    },
    {
      "id": "c105",
      "name": "JOSE DE FREITAS"
    },
    {
      "id": "c106",
      "name": "JUAZEIRO DO PIAUI"
    },
    {
      "id": "c107",
      "name": "JULIO BORGES"
    },
    {
      "id": "c108",
      "name": "JUREMA"
    },
    {
      "id": "c109",
      "name": "LAGOA ALEGRE"
    },
    {
      "id": "c110",
      "name": "LAGOA DE SAO FRANCISCO"
    },
    {
      "id": "c111",
      "name": "LAGOA DO BARRO DO PIAUI"
    },
    {
      "id": "c112",
      "name": "LAGOA DO PIAUI"
    },
    {
      "id": "c113",
      "name": "LAGOA DO SITIO"
    },
    {
      "id": "c114",
      "name": "LAGOINHA DO PIAUI"
    },
    {
      "id": "c115",
      "name": "LUIS CORREIA"
    },
    {
      "id": "c116",
      "name": "LUZILANDIA"
    },
    {
      "id": "c117",
      "name": "MADEIRO"
    },
    {
      "id": "c118",
      "name": "MANOEL EMIDIO"
    },
    {
      "id": "c119",
      "name": "MARCOLANDIA"
    },
    {
      "id": "c120",
      "name": "MARCOS PARENTE"
    },
    {
      "id": "c121",
      "name": "MASSAPE DO PIAUI"
    },
    {
      "id": "c122",
      "name": "MATIAS OLIMPIO"
    },
    {
      "id": "c123",
      "name": "MIGUEL ALVES"
    },
    {
      "id": "c124",
      "name": "MIGUEL LEAO"
    },
    {
      "id": "c125",
      "name": "MILTON BRANDAO"
    },
    {
      "id": "c126",
      "name": "MONSENHOR GIL"
    },
    {
      "id": "c127",
      "name": "MONSENHOR HIPOLITO"
    },
    {
      "id": "c128",
      "name": "MONTE ALEGRE"
    },
    {
      "id": "c129",
      "name": "MORRO CABECA NO TEMPO"
    },
    {
      "id": "c130",
      "name": "MORRO DO CHAPEU DO PIAUI"
    },
    {
      "id": "c131",
      "name": "MURICI DOS PORTELAS"
    },
    {
      "id": "c132",
      "name": "NAZARE DO PIAUI"
    },
    {
      "id": "c133",
      "name": "NAZARIA"
    },
    {
      "id": "c134",
      "name": "NOSSA SENHORA DE NAZARE"
    },
    {
      "id": "c135",
      "name": "NOSSA SRA DOS REMEDIOS"
    },
    {
      "id": "c136",
      "name": "NOVA SANTA RITA"
    },
    {
      "id": "c137",
      "name": "NOVO ORIENTE DO PIAU"
    },
    {
      "id": "c138",
      "name": "NOVO SANTO ANTONIO"
    },
    {
      "id": "c139",
      "name": "OEIRAS"
    },
    {
      "id": "c140",
      "name": "OLHO D'AGUA DO PIAUI"
    },
    {
      "id": "c141",
      "name": "PADRE MARCOS"
    },
    {
      "id": "c142",
      "name": "PAES LANDIM"
    },
    {
      "id": "c143",
      "name": "PAJEU DO PIAUI"
    },
    {
      "id": "c144",
      "name": "PALMEIRA DO PIAUI"
    },
    {
      "id": "c145",
      "name": "PALMEIRAIS"
    },
    {
      "id": "c146",
      "name": "PAQUETA"
    },
    {
      "id": "c147",
      "name": "PARNAGUA"
    },
    {
      "id": "c148",
      "name": "PARNAIBA"
    },
    {
      "id": "c149",
      "name": "PASSAGEM FRANCA"
    },
    {
      "id": "c150",
      "name": "PATOS DO PIAUI"
    },
    {
      "id": "c151",
      "name": "PAU D ARCO DO PIAUI"
    },
    {
      "id": "c152",
      "name": "PAULISTANA"
    },
    {
      "id": "c153",
      "name": "PAVUSSU"
    },
    {
      "id": "c154",
      "name": "PEDRO II"
    },
    {
      "id": "c155",
      "name": "PEDRO LAURENTINO"
    },
    {
      "id": "c156",
      "name": "PICOS"
    },
    {
      "id": "c157",
      "name": "PIMENTEIRAS"
    },
    {
      "id": "c158",
      "name": "PIO IX"
    },
    {
      "id": "c159",
      "name": "PIRACURUCA"
    },
    {
      "id": "c160",
      "name": "PIRIPIRI"
    },
    {
      "id": "c161",
      "name": "PORTO"
    },
    {
      "id": "c162",
      "name": "PORTO ALEGRE DO PIAUI"
    },
    {
      "id": "c163",
      "name": "POV BARRA DO LONGA"
    },
    {
      "id": "c164",
      "name": "POV BREJINHO"
    },
    {
      "id": "c165",
      "name": "POV BURITI DO CASTELO"
    },
    {
      "id": "c166",
      "name": "POV CALDEIRAOZINHO"
    },
    {
      "id": "c167",
      "name": "POV COROA DE SAO REMIGIO"
    },
    {
      "id": "c168",
      "name": "POV DAVID CALDAS"
    },
    {
      "id": "c169",
      "name": "POV INGAZEIRA"
    },
    {
      "id": "c170",
      "name": "POV MOCAMBINHO"
    },
    {
      "id": "c171",
      "name": "POV SERRA DA SOLTA"
    },
    {
      "id": "c172",
      "name": "POV. LAGOA DE BAIXO"
    },
    {
      "id": "c173",
      "name": "POVOADO APARECIDA"
    },
    {
      "id": "c174",
      "name": "POVOADO BARRA GRANDE"
    },
    {
      "id": "c175",
      "name": "POVOADO BURITIZINHO"
    },
    {
      "id": "c176",
      "name": "POVOADO CAFUNDO"
    },
    {
      "id": "c177",
      "name": "POVOADO FORTES"
    },
    {
      "id": "c178",
      "name": "POVOADO MANDACARU"
    },
    {
      "id": "c179",
      "name": "POVOADO MATINHA"
    },
    {
      "id": "c180",
      "name": "POVOADO PEDRA"
    },
    {
      "id": "c181",
      "name": "POVOADO POCAO"
    },
    {
      "id": "c182",
      "name": "POVOADO RIACHO DOS NEGRO"
    },
    {
      "id": "c183",
      "name": "POVOADO SAO JOAQUIM"
    },
    {
      "id": "c184",
      "name": "POVOADO TRANQUEIRA"
    },
    {
      "id": "c185",
      "name": "PRATA DO PIAUI"
    },
    {
      "id": "c186",
      "name": "QUEIMADA NOVA"
    },
    {
      "id": "c187",
      "name": "REDENCAO DO GURGUEIA"
    },
    {
      "id": "c188",
      "name": "REGENERACAO"
    },
    {
      "id": "c189",
      "name": "RIACHO FRIO"
    },
    {
      "id": "c190",
      "name": "RIBEIRA DO PIAUI"
    },
    {
      "id": "c191",
      "name": "RIBEIRO GONCALVES"
    },
    {
      "id": "c192",
      "name": "RIO GRANDE DO PIAUI"
    },
    {
      "id": "c193",
      "name": "SANTA CRUZ DO PIAUI"
    },
    {
      "id": "c194",
      "name": "SANTA CRUZ DOS MILAGRES"
    },
    {
      "id": "c195",
      "name": "SANTA FILOMENA"
    },
    {
      "id": "c196",
      "name": "SANTA LUZ"
    },
    {
      "id": "c197",
      "name": "SANTA ROSA DO PIAUI"
    },
    {
      "id": "c198",
      "name": "SANTA TERESA"
    },
    {
      "id": "c199",
      "name": "SANTANA DO PIAUI"
    },
    {
      "id": "c200",
      "name": "SANTO ANTONIO D MILA"
    },
    {
      "id": "c201",
      "name": "SANTO ANTONIO DE LISBOA"
    },
    {
      "id": "c202",
      "name": "SANTO INACIO DO PIAUI"
    },
    {
      "id": "c203",
      "name": "SAO BRAZ"
    },
    {
      "id": "c204",
      "name": "SAO FELIX"
    },
    {
      "id": "c205",
      "name": "SAO FRANCISCO DE ASSIS"
    },
    {
      "id": "c206",
      "name": "SAO FRANCISCO DO PIAUI"
    },
    {
      "id": "c207",
      "name": "SAO GONCALO DO GURGUEIA"
    },
    {
      "id": "c208",
      "name": "SAO GONCALO DO PIAUI"
    },
    {
      "id": "c209",
      "name": "SAO JOAO DA CANABRAVA"
    },
    {
      "id": "c210",
      "name": "SAO JOAO DA FRONTEIRA"
    },
    {
      "id": "c211",
      "name": "SAO JOAO DA SERRA"
    },
    {
      "id": "c212",
      "name": "SAO JOAO DA VARJOTA"
    },
    {
      "id": "c213",
      "name": "SAO JOAO DO ARRAIAL"
    },
    {
      "id": "c214",
      "name": "SAO JOAO DO PIAUI"
    },
    {
      "id": "c215",
      "name": "SAO JOSE DA TENDA"
    },
    {
      "id": "c216",
      "name": "SAO JOSE DO DIVINO"
    },
    {
      "id": "c217",
      "name": "SAO JOSE DO PEIXE"
    },
    {
      "id": "c218",
      "name": "SAO JOSE DO PIAUI"
    },
    {
      "id": "c219",
      "name": "SAO JULIAO"
    },
    {
      "id": "c220",
      "name": "SAO LOURENCO"
    },
    {
      "id": "c221",
      "name": "SAO LUIS DO PIAUI"
    },
    {
      "id": "c222",
      "name": "SAO MIGUEL DA BAIXA GRANDE"
    },
    {
      "id": "c223",
      "name": "SAO MIGUEL DO FIDALGO"
    },
    {
      "id": "c224",
      "name": "SAO MIGUEL TAPUIO"
    },
    {
      "id": "c225",
      "name": "SAO PEDRO"
    },
    {
      "id": "c226",
      "name": "SAO RAIMUNDO NONATO"
    },
    {
      "id": "c227",
      "name": "SEBASTIAO BARROS"
    },
    {
      "id": "c228",
      "name": "SEBASTIAO LEAL"
    },
    {
      "id": "c229",
      "name": "SIGEFREDO PACHECO"
    },
    {
      "id": "c230",
      "name": "SIMOES"
    },
    {
      "id": "c231",
      "name": "SIMPLICIO MENDES"
    },
    {
      "id": "c232",
      "name": "SOCORRO DO PIAUI"
    },
    {
      "id": "c233",
      "name": "SUSSUAPARA"
    },
    {
      "id": "c234",
      "name": "TAMBORIL DO PIAUI"
    },
    {
      "id": "c235",
      "name": "TANQUE DO PIAUI"
    },
    {
      "id": "c236",
      "name": "TERESINA"
    },
    {
      "id": "c237",
      "name": "UNIAO"
    },
    {
      "id": "c238",
      "name": "URUCUI"
    },
    {
      "id": "c239",
      "name": "VALENCA"
    },
    {
      "id": "c240",
      "name": "VARZEA BRANCA"
    },
    {
      "id": "c241",
      "name": "VARZEA GRANDE"
    },
    {
      "id": "c242",
      "name": "VERA MENDES"
    },
    {
      "id": "c243",
      "name": "VILA NOVA DO PIAUI"
    },
    {
      "id": "c244",
      "name": "WALL FERRAZ"
    }
  ],
  "64": [
    {
      "id": "c001",
      "name": "AFUA"
    },
    {
      "id": "c002",
      "name": "ANAJAS"
    },
    {
      "id": "c003",
      "name": "ANANINDEUA"
    },
    {
      "id": "c004",
      "name": "BELEM"
    },
    {
      "id": "c005",
      "name": "BREVES"
    },
    {
      "id": "c006",
      "name": "CACHOEIRA DO ARARI"
    },
    {
      "id": "c007",
      "name": "CASTANHAL"
    },
    {
      "id": "c008",
      "name": "INHANGAPI"
    },
    {
      "id": "c009",
      "name": "MARITUBA"
    },
    {
      "id": "c010",
      "name": "PONTA DE PEDRAS"
    },
    {
      "id": "c011",
      "name": "PORTEL"
    },
    {
      "id": "c012",
      "name": "SALVATERRA"
    },
    {
      "id": "c013",
      "name": "SANTA IZABEL DO PARA"
    },
    {
      "id": "c014",
      "name": "SANTO ANTONIO DO TAUA"
    },
    {
      "id": "c015",
      "name": "SOURE"
    }
  ],
  "65": [
    {
      "id": "c001",
      "name": "ABAETETUBA"
    },
    {
      "id": "c002",
      "name": "AUGUSTO CORREA"
    },
    {
      "id": "c003",
      "name": "BAIAO"
    },
    {
      "id": "c004",
      "name": "BRAGANÇA"
    },
    {
      "id": "c005",
      "name": "CAPANEMA"
    },
    {
      "id": "c006",
      "name": "CAPITAO POCO"
    },
    {
      "id": "c007",
      "name": "COLARES"
    },
    {
      "id": "c008",
      "name": "CURUÇA"
    },
    {
      "id": "c009",
      "name": "IGARAPE ACU"
    },
    {
      "id": "c010",
      "name": "IGARAPE MIRI"
    },
    {
      "id": "c011",
      "name": "LIMOEIRO DO AJURU"
    },
    {
      "id": "c012",
      "name": "MAGALHAES BARATA"
    },
    {
      "id": "c013",
      "name": "MARAPANIM"
    },
    {
      "id": "c014",
      "name": "MOCAJUBA"
    },
    {
      "id": "c015",
      "name": "MOJU"
    },
    {
      "id": "c016",
      "name": "NOVA TIMBOTEUA"
    },
    {
      "id": "c017",
      "name": "OUREM"
    },
    {
      "id": "c018",
      "name": "PEIXE BOI"
    },
    {
      "id": "c019",
      "name": "PRIMAVERA"
    },
    {
      "id": "c020",
      "name": "QUATIPURU"
    },
    {
      "id": "c021",
      "name": "SALINOPOLIS"
    },
    {
      "id": "c022",
      "name": "SANTA LUZIA DO PARA"
    },
    {
      "id": "c023",
      "name": "SANTA MARIA DO PARA"
    },
    {
      "id": "c024",
      "name": "SAO CAETANO DE ODIVELAS"
    },
    {
      "id": "c025",
      "name": "SAO FRANCISCO DO PARA"
    },
    {
      "id": "c026",
      "name": "SAO JOAO DE PIRABAS"
    },
    {
      "id": "c027",
      "name": "TAILANDIA"
    },
    {
      "id": "c028",
      "name": "TERRA ALTA"
    },
    {
      "id": "c029",
      "name": "TRACUATEUA"
    },
    {
      "id": "c030",
      "name": "VIGIA"
    },
    {
      "id": "c031",
      "name": "VISEU"
    }
  ],
  "66": [
    {
      "id": "c001",
      "name": "ALENQUER"
    },
    {
      "id": "c002",
      "name": "ALMEIRIM"
    },
    {
      "id": "c003",
      "name": "ALTAMIRA"
    },
    {
      "id": "c004",
      "name": "BELTERRA"
    },
    {
      "id": "c005",
      "name": "BRASIL NOVO"
    },
    {
      "id": "c006",
      "name": "FARO"
    },
    {
      "id": "c007",
      "name": "ITAITUBA"
    },
    {
      "id": "c008",
      "name": "MOJUI DOS CAMPOS"
    },
    {
      "id": "c009",
      "name": "MONTE ALEGRE"
    },
    {
      "id": "c010",
      "name": "OBIDOS"
    },
    {
      "id": "c011",
      "name": "ORIXIMINA"
    },
    {
      "id": "c012",
      "name": "PORTO DE MOZ"
    },
    {
      "id": "c013",
      "name": "PRAINHA"
    },
    {
      "id": "c014",
      "name": "SANTAREM"
    },
    {
      "id": "c015",
      "name": "SENADOR JOSE PORFIRIO"
    },
    {
      "id": "c016",
      "name": "TERRA SANTA"
    }
  ],
  "67": [
    {
      "id": "c001",
      "name": "BREU BRANCO"
    },
    {
      "id": "c002",
      "name": "CANAA DOS CARAJAS"
    },
    {
      "id": "c003",
      "name": "CONCEICAO DO ARAGUAIA"
    },
    {
      "id": "c004",
      "name": "DOM ELISEU"
    },
    {
      "id": "c005",
      "name": "MARABA"
    },
    {
      "id": "c006",
      "name": "OURILANDIA DO NORTE"
    },
    {
      "id": "c007",
      "name": "PARAUAPEBAS"
    },
    {
      "id": "c008",
      "name": "RONDON DO PARÁ"
    },
    {
      "id": "c009",
      "name": "SANTA MARIA DAS BARREIRAS"
    },
    {
      "id": "c010",
      "name": "SAO FELIX DO XINGU"
    },
    {
      "id": "c011",
      "name": "TUCURUI"
    }
  ]
}

export const REGIONAL_POR_UNIDADE: Record<string, string> = {
  "2": "R1",
  "3": "R2",
  "7": "R1",
  "8": "R1",
  "9": "R1",
  "10": "R1",
  "11": "R1",
  "12": "R1",
  "13": "R1",
  "14": "R1",
  "15": "R1",
  "16": "R1",
  "17": "R1",
  "18": "R1",
  "19": "R1",
  "20": "R1",
  "27": "R1",
  "28": "R1",
  "29": "R1",
  "30": "R1",
  "31": "R2",
  "32": "R1",
  "33": "R3",
  "34": "R2",
  "35": "R1",
  "36": "R1",
  "37": "R1",
  "38": "R1",
  "39": "R1",
  "40": "R2",
  "41": "R3",
  "42": "R1",
  "43": "R2",
  "44": "R2",
  "45": "R3",
  "46": "R3",
  "47": "R2",
  "48": "R3",
  "49": "R3",
  "50": "R3",
  "51": "R3",
  "56": "R4",
  "57": "R4",
  "59": "R5",
  "60": "R3",
  "61": "R1",
  "62": "R5",
  "63": "R3",
  "64": "R3",
  "65": "R3",
  "66": "R3",
  "67": "R3"
}

/** Nome da empresa a partir do EMP_CODIGO — '' se o código não existe no de-para. */
export function nomeUnidade(unidadeId: string): string {
  for (const unidades of Object.values(UNIDADES_POR_REGIONAL_REAL)) {
    const achou = unidades.find((u) => u.id === unidadeId)
    if (achou) return achou.nome
  }
  return ''
}

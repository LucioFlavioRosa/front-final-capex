/**
 * A HOME — a porta da plataforma, e só isso.
 *
 * ELA MOSTRAVA DADO DE SIMULAÇÃO e deixou de mostrar (29/08/2026, decisão dele):
 * nem VPL, nem horizonte do plano, nem status do cadastro. O argumento é de
 * papel: esse dado tem casa própria — o plano vive em `/resultados`, a
 * completude vive dentro do wizard, e as duas telas o mostram com muito mais
 * contexto do que um resumo caberia dar. Repetir na entrada não informava,
 * duplicava; e obrigava a Home a quatro chamadas de API para desenhar algo que a
 * pessoa releria adiante de qualquer jeito.
 *
 * O que sobra é o que uma entrada deve responder: onde estou, e o que dá para
 * fazer aqui. `homeDados.ts` e `HorizonteDoPlano.tsx` saíram junto — código sem
 * chamador é dívida, e os dois estão em `b7026a4` se um dia voltarem.
 *
 * A ARTE, e por que ela NÃO é foto sangrando com título por cima. Texto sobre
 * fotografia é o movimento padrão de toda landing page, e ainda estraga o
 * contraste: o mesmo branco cai sobre céu claro e sobre mata escura. Aqui o tipo
 * mora num painel navy sólido e as fotos são CHAPAS ao lado dele — contraste
 * garantido, e as imagens ganham moldura em vez de virarem fundo.
 *
 * As duas fotos são de ETEs da própria operação, tiradas em dias diferentes: uma
 * nublada e esverdeada, outra de sol forte. Cruas, lado a lado, brigam. O duotone
 * (cinza + gradiente da marca em `screen`) põe as duas na mesma luz e faz delas
 * material do produto, não banco de imagem.
 *
 * E o assunto é o que justifica a foto: no modelo, TODO caminho termina numa ETE.
 * A imagem é o destino de cada seta do fluxo de escoamento — não é ilustração de
 * saneamento em geral.
 */
import { NavLink } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'
import { NAV_ITEMS } from '../config/navigation'
import { useAuth } from '../auth/AuthContext'

/** Destaque por módulo. Cadastro lê uma cor editável (--color-mod-cadastro). */
const moduleClasses: Record<string, string> = {
  '/cadastro': 'bg-mod-cadastro/10 text-mod-cadastro',
}

/** Uma chapa: a foto em duotone da marca, dentro da moldura. */
function Chapa({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="relative overflow-hidden">
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="h-full w-full object-cover"
        // O cinza é a base do duotone; o contraste devolve o desenho dos tanques
        // que a dessaturação achata.
        style={{ filter: 'grayscale(1) contrast(1.42) brightness(0.78)' }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(155deg, #01209B 0%, #0D6B6F 55%, #17E3CB 100%)',
          mixBlendMode: 'screen',
          opacity: 0.55,
        }}
      />
      {/* Um véu navy por multiply assenta os claros — sem ele o céu da foto de
          sol estoura em turquesa e as duas voltam a não combinar. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ background: '#01209B', mixBlendMode: 'multiply', opacity: 0.45 }}
      />
    </figure>
  )
}

export function Home() {
  const { user } = useAuth()
  const primeiroNome = (user?.name || user?.email || '').split(/[ @.]/)[0]
  const saudacao = primeiroNome
    ? `Olá, ${primeiroNome[0].toUpperCase()}${primeiroNome.slice(1)}`
    : 'Olá'

  return (
    <section className="max-w-content mx-auto px-4 py-8 md:px-6">
      {/* A ARTE. Uma peça só: painel de texto + duas chapas, com o mesmo raio da
          `.carta` para pertencer à família das outras superfícies. */}
      <div className="grid overflow-hidden rounded-2xl shadow-band lg:grid-cols-[1.05fr_.95fr]">
        <div className="band-surface flex flex-col justify-center px-8 py-10 md:px-11 md:py-14">
          <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-aegea-300">
            {saudacao}
          </p>
          <h1 className="mt-3 text-[26px] font-extrabold leading-[1.18] tracking-tight text-white md:text-[33px]">
            Em que ordem construir — e quando cada sub-bacia começa a faturar.
          </h1>
          <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-white/70">
            O otimizador sequencia as obras de esgotamento sanitário de uma unidade dentro do
            orçamento e das metas do contrato. Todo caminho termina numa estação de tratamento.
          </p>
          {/* Um filete turquesa: o mesmo acento das chapas, fechando a peça. */}
          <div className="mt-7 h-[3px] w-16 rounded-full bg-aegea-400" />
        </div>

        {/* Duas chapas, e não uma: a operação não tem uma ETE, tem centenas —
            duas imagens dizem "conjunto", uma diria "esta aqui". */}
        <div className="grid min-h-[230px] grid-cols-2 gap-[3px] bg-water-950 lg:min-h-[310px]">
          <Chapa
            src="/assets/ete/ete-tanques.jpg"
            alt="Vista aérea de uma estação de tratamento de esgoto, com os tanques de aeração em sequência"
          />
          <Chapa
            src="/assets/ete/ete-lagoa.jpg"
            alt="Vista aérea de uma estação de tratamento de esgoto cercada por mata"
          />
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-water">
          Módulos da plataforma
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS.map((item) => {
            const IconCmp = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="carta min-w-0 p-5 text-left transition-all duration-hover ease-saida hover:border-water-200 hover:shadow-elev"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${moduleClasses[item.path]}`}
                  >
                    <IconCmp weight="fill" className="text-xl" />
                  </div>
                  <ArrowRight className="text-ink-500" />
                </div>
                <h2 className="mt-2.5 text-[15px] font-bold tracking-tight text-body-text">
                  {item.title}
                </h2>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                  {item.description}
                </p>
              </NavLink>
            )
          })}
        </div>
      </div>
    </section>
  )
}

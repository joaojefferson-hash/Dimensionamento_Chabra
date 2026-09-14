/* ==========================================================================
   Tela: Programação Anual — a equipe de cada unidade dá conta da carteira?
   Um cartão por unidade com sinal (verde / amarelo / vermelho) e frases
   prontas: quanto a equipe consegue, quanto a carteira precisa, quantas
   pessoas faltam ou sobram.
   ========================================================================== */

const ViewProgramacaoAnual = {
  id: 'programacao-anual',
  title: 'Programação Anual',

  render(el) {
    const janela = Programacao.lerJanela();
    const p = Store.parametros.get();
    const unidades = Store.unidades.list();
    const colaboradores = Store.colaboradores.list();
    const simulacoes = Programacao.lerSimulacao();
    const r = Calculo.calcular({ unidades, colaboradores, parametros: p, janela, simulacoes });
    const periodo = Programacao.descricaoJanela(janela);
    const TEC = Calculo.TEC, ADM = Calculo.ADM;

    const cartaoFuncao = (item, funcao) => {
      const res = item.janela.funcoes[funcao];
      const entregas = Calculo.ENTREGAS_DA_FUNCAO[funcao];
      return `
        <div class="bloco-funcao ${Programacao.classeLinha(res.status)}">
          <div class="bloco-head">
            <strong>${Calculo.FUNCAO_CURTA[funcao]}</strong>
            <span class="muted">${Programacao.pessoasTexto(item.pessoas[funcao], item.pessoasSimuladas[funcao], item.pessoas[funcao] === 1 ? 'pessoa' : 'pessoas')}</span>
            ${Programacao.statusChip(res.status)}
          </div>
          <ul class="frases">
            ${entregas.map(e => `<li>${e.rotulo}: ${Programacao.fraseEntrega(e, item.janela.entregas[e.id])}</li>`).join('')}
          </ul>
          <p class="rec-linha">${Programacao.recomendacaoHTML(res.recomendacao)}</p>
        </div>`;
    };

    const cartaoUnidade = (item, titulo, subtitulo) => `
      <section class="card cartao-unidade ${Programacao.classeLinha(item.janela.status)}">
        <div class="card-head">
          <div>
            <h2>${UI.esc(titulo)}</h2>
            <div class="muted">${subtitulo}</div>
            <div class="linha-chefia">${Programacao.chefiaHTML(item.chefia)}</div>
          </div>
          ${Programacao.statusChip(item.janela.status)}
        </div>
        <div class="blocos-funcao">
          ${cartaoFuncao(item, TEC)}
          ${cartaoFuncao(item, ADM)}
        </div>
      </section>`;

    const subtituloDe = item => {
      const media = Programacao.numFte(item.janela.empresasMedia);
      return `Documentos vencidos: <strong>${media}</strong> ${item.janela.empresasMedia === 1 ? 'empresa' : 'empresas'} por mês` +
        (item.janela.mesesComExcecao ? ` <span class="chip chip-blue" title="A quantidade muda em ${item.janela.mesesComExcecao} ${item.janela.mesesComExcecao === 1 ? 'mês' : 'meses'} do período">varia no período</span>` : '');
    };

    el.innerHTML = `
      <header class="page-header">
        <h1>Programação Anual</h1>
        <p>A equipe de cada unidade dá conta das empresas da carteira? Se não, quantas pessoas faltam; se sobra, quanto. Período: <strong>${periodo}</strong>.</p>
      </header>

      ${Programacao.barraHTML({ janela, ocupacaoAlvo: p.ocupacaoAlvo })}

      ${unidades.length === 0 ? `
        <section class="card"><div class="empty"><strong>Nenhuma unidade cadastrada</strong>Cadastre unidades, empresas por unidade e colaboradores para ver a programação.</div></section>` : `

      ${Programacao.simulacaoHTML({ unidades, janela })}

      ${cartaoUnidade(r.total, 'Todas as unidades', subtituloDe(r.total) + ` · ${Programacao.pessoasTexto(r.total.pessoas[TEC], r.total.pessoasSimuladas[TEC], 'técnicos')} e ${Programacao.pessoasTexto(r.total.pessoas[ADM], r.total.pessoasSimuladas[ADM], 'administrativos')}`)}

      ${Programacao.avisosHTML(r.avisos)}

      <div class="grade-cartoes">
        ${r.unidades.map(u => cartaoUnidade(u, u.nome, subtituloDe(u))).join('')}
      </div>

      ${Programacao.legendaHTML()}
      `}
    `;

    Programacao.bindBarra(el, { onJanela: () => App.render() });
    Programacao.bindSimulacao(el, { unidades, janela });
  },
};

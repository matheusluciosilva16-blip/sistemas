// Testes da importação do CSV do Meta e das fórmulas. Rodar com: npm run testar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerCsv, lerDecimal, lerInteiro, lerDia, importarCsv, decodificar } from '../src/lib/importar-csv.js';
import { derivar, resolverPeriodo } from '../src/lib/metricas.js';

test('CSV com aspas, vírgula dentro do campo, ponto e vírgula e BOM', () => {
  assert.deepEqual(lerCsv('﻿a,b\n"x, y","z ""q"""\n').linhas, [['a', 'b'], ['x, y', 'z "q"']]);
  assert.equal(lerCsv('a;b\r\n1,5;2\r\n').separador, ';');
});

test('números nos formatos do Brasil e dos EUA', () => {
  assert.equal(lerDecimal('1.234,56'), 1234.56);
  assert.equal(lerDecimal('1,234.56'), 1234.56);
  assert.equal(lerDecimal('30.22'), 30.22);
  assert.equal(lerDecimal('12,5'), 12.5);
  assert.equal(lerDecimal('R$ 1.000.000'), 1000000);
  assert.equal(lerInteiro('1.234'), 1234);
  assert.equal(lerInteiro('-'), null);
  assert.equal(lerDia('15/10/2026'), '2026-10-15');
});

const CAB = '"Dia","Nome da campanha","Nome do conjunto de anúncios","Nome do anúncio","Valor usado (BRL)","Impressões","Alcance","Cliques no link"';

test('importa o CSV do Meta e soma linhas repetidas', () => {
  const r = importarCsv(`${CAB}\n"2026-10-01","C1","A","X","10,50","1.000","800","12"\n"2026-10-01","C1","A","X","1,00","100","90","1"\n"2026-10-02","C1","A","X","5","500","400","4"\n`);
  assert.equal(r.linhas.length, 2);
  assert.equal(r.linhas[0].investimento, 1150);
  assert.equal(r.linhas[0].impressoes, 1100);
  assert.equal(r.dataInicio, '2026-10-01');
  assert.equal(r.nivel, 'anúncio');
  assert.ok(r.avisos.some((a) => a.includes('Visualizações da página de destino')));
});

test('recusa arquivo sem detalhamento por dia', () => {
  const cab = '"Início dos relatórios","Término dos relatórios","Nome da campanha","Valor usado (BRL)","Impressões"';
  assert.throws(() => importarCsv(`${cab}\n"2026-10-01","2026-10-31","C1","100","1000"\n`), /Por tempo → Dia/);
  assert.throws(() => importarCsv('"Campanha","Gasto"\n"a","1"\n'), /Não reconheci/);
});

test('aceita cabeçalho em inglês e ignora linha de total', () => {
  const r = importarCsv('"Day","Campaign name","Amount spent (BRL)","Impressions","Link clicks"\n"2026-10-01","C1","10.00","1000","20"\n"","","10.00","1000","20"\n');
  assert.equal(r.linhas.length, 1);
  assert.equal(r.nivel, 'campanha');
  assert.ok(r.avisos.some((a) => a.includes('ignoradas')));
});

test('fórmulas da especificação', () => {
  const ads = { investimento: 100000, impressoes: 50000, alcance: 25000, impressoes_com_alcance: 50000, cliques_link: 500,
    lp_views: 400, cliques_com_lp: 500, video_3s: 10000, impressoes_video: 40000, video_50: 3000, thruplays: null, conversas: null };
  const ld = { leads: 40, qualificados: 20, agendadas: 10, realizadas: 8, contratos: 4, honorarios: 1600000, honorarios_projetados: 2400000 };
  const m = derivar(ads, ld);
  assert.equal(m.frequencia, 2);
  assert.equal(m.cpm, 2000);              // R$ 20,00
  assert.equal(m.hook_rate, 0.25);        // só sobre impressões de vídeo
  assert.equal(m.hold_rate, 0.3);
  assert.equal(m.ctr, 0.01);
  assert.equal(m.cpc, 200);
  assert.equal(m.taxa_carregamento, 0.8);
  assert.equal(m.taxa_conversao, 0.1);     // leads ÷ visualizações da página
  assert.equal(m.cpl, 2500);
  assert.equal(m.taxa_qualificacao, 0.5);
  assert.equal(m.taxa_agendamento, 0.5);
  assert.equal(m.taxa_comparecimento, 0.8);
  assert.equal(m.taxa_fechamento, 0.5);
  assert.equal(m.cac, 25000);             // R$ 250,00
  assert.equal(m.ticket_medio, 400000);
  assert.equal(m.roas_imediato, 16);
  assert.equal(m.roas_projetado, 24);
});

test('divisão por zero vira vazio, nunca 0 ou infinito', () => {
  const m = derivar({ investimento: 1000, impressoes: 0 }, { leads: 0, contratos: 0 });
  assert.equal(m.cpm, null);
  assert.equal(m.cpl, null);
  assert.equal(m.cac, null);
});

test('período anterior tem o mesmo tamanho', () => {
  const p = resolverPeriodo({ periodo: 'personalizado', desde: '2026-10-01', ate: '2026-10-10' });
  assert.equal(p.dias, 10);
  assert.deepEqual(p.anterior, { desde: '2026-09-21', ate: '2026-09-30' });
  assert.equal(resolverPeriodo({ periodo: 'xyz' }).periodo, '30d');
});

test('relatório do Google Ads: linhas de título, totais, "--" e conversões com decimais', () => {
  const csv = [
    'Relatório de campanhas',
    '1 de outubro de 2026 - 2 de outubro de 2026',
    'Dia,Campanha,Grupo de anúncios,Código da moeda,Custo,Impr.,Cliques,Conversões',
    '2026-10-01,Conta bloqueada RJ,Grupo 1,BRL,"45,30",1.234,56,"2,00"',
    '2026-10-02,Conta bloqueada RJ,Grupo 1,BRL,"12,00",300,9,--',
    'Total: conta,--,--,BRL,"57,30",1.534,65,"2,00"',
  ].join('\n');
  const r = importarCsv(csv);
  assert.equal(r.plataforma, 'google');
  assert.equal(r.linhas.length, 2);
  assert.equal(r.linhas[0].investimento, 4530);
  assert.equal(r.linhas[0].impressoes, 1234);
  assert.equal(r.linhas[0].cliques_link, 56);
  assert.equal(r.linhas[0].conversas, 2);
  assert.equal(r.linhas[1].conversas, null);
  assert.equal(r.linhas[0].conjunto, 'Grupo 1');
  assert.ok(r.avisos.some((a) => a.includes('ignoradas')));
});

test('Google em UTF-16 com tabulação ("CSV para Excel")', () => {
  const texto = '\uFEFFDay\tCampaign\tCost\tImpr.\tClicks\n2026-10-01\tC1\t10.50\t1000\t20\n';
  const bytes = new Uint8Array(2 + texto.length * 2);
  bytes[0] = 0xff; bytes[1] = 0xfe;
  for (let i = 0; i < texto.length; i++) { bytes[2 + i * 2] = texto.charCodeAt(i) & 0xff; bytes[3 + i * 2] = texto.charCodeAt(i) >> 8; }
  const r = importarCsv(decodificar(bytes));
  assert.equal(r.plataforma, 'google');
  assert.equal(r.linhas[0].investimento, 1050);
});

test('Google sem coluna de dia é recusado com instrução', () => {
  assert.throws(() => importarCsv('Campanha,Custo,Impr.\nC1,"10,00",100\n'), /Tempo → Dia/);
});

test('inteiros: milhar e decimal não se confundem', () => {
  assert.equal(lerInteiro('1.234'), 1234);
  assert.equal(lerInteiro('1,234'), 1234);
  assert.equal(lerInteiro('2,00'), 2);
  assert.equal(lerInteiro('--'), null);
});

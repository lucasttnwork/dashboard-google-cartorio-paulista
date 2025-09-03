#!/usr/bin/env node

/**
 * 🏢 SCRIPT DE ACESSO RÁPIDO - DADOS DO CARTÓRIO PAULISTA
 * 
 * Este script facilita o acesso aos dados coletados do Cartório Paulista
 * especialmente os identificadores API necessários para chamadas futuras.
 */

const fs = require('fs');
const path = require('path');

// Carrega os dados do cartório
function carregarDadosCartorio() {
  try {
    const dadosPath = path.join(__dirname, 'cartorio-paulista-dados.json');
    const dados = JSON.parse(fs.readFileSync(dadosPath, 'utf8'));
    return dados.cartorio_paulista;
  } catch (error) {
    console.error('❌ Erro ao carregar dados:', error.message);
    return null;
  }
}

// Exibe informações principais
function exibirInformacoesPrincipais(cartorio) {
  console.log('\n🏢 CARTÓRIO PAULISTA - INFORMAÇÕES PRINCIPAIS\n');
  
  console.log(`📋 Nome: ${cartorio.informacoes_basicas.nome_completo}`);
  console.log(`⭐ Rating: ${cartorio.avaliacoes.rating_geral}/5 (${cartorio.avaliacoes.total_avaliacoes.toLocaleString()} avaliações)`);
  console.log(`📍 Endereço: ${cartorio.contato.endereco_completo}`);
  console.log(`📞 Telefone: ${cartorio.contato.telefone}`);
  console.log(`🔗 Website: ${cartorio.contato.website}`);
}

// Exibe identificadores API
function exibirIdentificadoresAPI(cartorio) {
  console.log('\n🔑 IDENTIFICADORES API (CRÍTICOS PARA DESENVOLVIMENTO)\n');
  
  const ids = cartorio.identificadores_api;
  console.log(`🆔 Place ID: ${ids.place_id}`);
  console.log(`🆔 CID: ${ids.cid}`);
  console.log(`🆔 Feature ID: ${ids.feature_id}`);
  console.log(`📍 Coordenadas: ${ids.latitude}, ${ids.longitude}`);
  
  console.log('\n📋 COPY-PASTE PARA DESENVOLVIMENTO:');
  console.log('```javascript');
  console.log(`const PLACE_ID = "${ids.place_id}";`);
  console.log(`const CID = "${ids.cid}";`);
  console.log(`const COORDS = {lat: ${ids.latitude}, lng: ${ids.longitude}};`);
  console.log('```');
}

// Exibe métricas de avaliações
function exibirMetricasAvaliacoes(cartorio) {
  console.log('\n📊 MÉTRICAS DE AVALIAÇÕES\n');
  
  const dist = cartorio.avaliacoes.distribuicao;
  Object.entries(dist).forEach(([estrelas, dados]) => {
    const stars = estrelas.replace('_estrelas', '').replace('_estrela', '');
    const bar = '█'.repeat(Math.floor(dados.percentual / 5));
    console.log(`${stars}⭐: ${dados.quantidade.toLocaleString()} (${dados.percentual}%) ${bar}`);
  });
  
  console.log(`\n✅ Status: ${cartorio.metricas_reputacao.status_reputacao}`);
}

// Exibe configurações de API
function exibirConfiguracoesAPI(cartorio) {
  console.log('\n🔧 CONFIGURAÇÕES DE API\n');
  
  const apis = cartorio.apis_suportadas;
  
  console.log('DataForSEO Endpoints:');
  Object.entries(apis.dataforseo).forEach(([key, value]) => {
    if (key.startsWith('endpoint_')) {
      const name = key.replace('endpoint_', '').toUpperCase();
      console.log(`  ${name}: ${value}`);
    }
  });
  
  console.log('\nGoogle Business Profile:');
  console.log(`  Place ID: ${apis.google_business_profile.place_id}`);
  console.log(`  Status: ${apis.google_business_profile.status}`);
  console.log(`  Claimed: ${apis.google_business_profile.claimed ? '✅' : '❌'}`);
}

// Menu principal
function menu() {
  console.log('\n🎯 MENU DE OPÇÕES:\n');
  console.log('1. 📋 Informações Principais');
  console.log('2. 🔑 Identificadores API');
  console.log('3. 📊 Métricas de Avaliações'); 
  console.log('4. 🔧 Configurações de API');
  console.log('5. 📄 Exibir Todos os Dados');
  console.log('0. 🚪 Sair');
}

// Função principal
function main() {
  console.log('🏢 DASHBOARD CARTÓRIO PAULISTA - ACESSO RÁPIDO AOS DADOS');
  console.log('=' .repeat(60));
  
  const cartorio = carregarDadosCartorio();
  
  if (!cartorio) {
    console.log('❌ Não foi possível carregar os dados do cartório.');
    process.exit(1);
  }
  
  // Se foi chamado com argumentos, executa ação específica
  const args = process.argv.slice(2);
  
  if (args.length > 0) {
    switch (args[0]) {
      case 'place-id':
        console.log(cartorio.identificadores_api.place_id);
        break;
      case 'cid':
        console.log(cartorio.identificadores_api.cid);
        break;
      case 'rating':
        console.log(cartorio.avaliacoes.rating_geral);
        break;
      case 'total-reviews':
        console.log(cartorio.avaliacoes.total_avaliacoes);
        break;
      case 'endereco':
        console.log(cartorio.contato.endereco_completo);
        break;
      case 'telefone':
        console.log(cartorio.contato.telefone);
        break;
      case 'website':
        console.log(cartorio.contato.website);
        break;
      case 'info':
        exibirInformacoesPrincipais(cartorio);
        break;
      case 'api':
        exibirIdentificadoresAPI(cartorio);
        break;
      case 'metricas':
        exibirMetricasAvaliacoes(cartorio);
        break;
      case 'config':
        exibirConfiguracoesAPI(cartorio);
        break;
      case 'all':
        exibirInformacoesPrincipais(cartorio);
        exibirIdentificadoresAPI(cartorio);
        exibirMetricasAvaliacoes(cartorio);
        exibirConfiguracoesAPI(cartorio);
        break;
      default:
        console.log('❌ Argumento inválido. Use: place-id, cid, rating, info, api, metricas, config, all');
    }
    return;
  }
  
  // Modo interativo
  exibirInformacoesPrincipais(cartorio);
  exibirIdentificadoresAPI(cartorio);
  
  console.log('\n💡 DICAS DE USO:');
  console.log('  node acessar-dados-cartorio.js place-id  # Retorna apenas o Place ID');
  console.log('  node acessar-dados-cartorio.js cid       # Retorna apenas o CID');
  console.log('  node acessar-dados-cartorio.js api       # Mostra todos os identificadores');
  console.log('  node acessar-dados-cartorio.js all       # Mostra todas as informações');
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = {
  carregarDadosCartorio,
  exibirInformacoesPrincipais,
  exibirIdentificadoresAPI,
  exibirMetricasAvaliacoes,
  exibirConfiguracoesAPI
};

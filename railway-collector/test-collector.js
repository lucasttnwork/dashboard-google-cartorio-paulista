require('dotenv').config({ path: './.env' });

const ApifyCollector = require('./src/collectors/apify-collector');
const DataProcessor = require('./src/collectors/data-processor');
const storage = require('./src/storage/supabase-client');
const logInfo = require('./src/monitoring/logger').logInfo;

async function testSprint2() {
  const startTime = Date.now();
  let runId;
  
  try {
    logInfo('Iniciando teste real do Sprint 2 - Fluxo completo');

    // 1. Testar conexão Supabase
    const connected = await storage.testConnection();
    if (!connected) {
      throw new Error('Falha na conexão Supabase');
    }
    console.log('✅ Supabase conectado');

    // 2. Coletar reviews
    const collector = new ApifyCollector();
    const rawReviews = await collector.fetchReviews();
    console.log(`✅ Collector: ${rawReviews.length} reviews coletadas da Apify`);

    // 3. Normalizar
    const processor = new DataProcessor();
    const normalized = await processor.normalize(rawReviews);
    console.log(`✅ Normalização: ${normalized.length} reviews válidas`);

    // 4. Deduplicar
    const { newReviews, updatedReviews } = await processor.deduplicate(normalized);
    console.log(`✅ Dedup: ${newReviews.length} novas, ${updatedReviews.length} atualizadas`);

    // 5. Persistir com run tracking
    runId = await storage.createRun({ run_type: 'scheduled' });
    const persistResult = await storage.persistReviews(newReviews, updatedReviews, runId);
    await storage.updateLocationMetrics();
    await storage.finalizeRun(runId, {
      status: 'completed',
      execution_time_ms: Date.now() - startTime,
      reviews_found: rawReviews.length,
      reviews_new: persistResult.inserted,
      reviews_updated: persistResult.updated
    });

    console.log(`✅ Persistência: ${persistResult.inserted} inseridos, ${persistResult.updated} atualizados`);
    console.log(`✅ Run finalizado: ID ${runId}`);
    console.log(`⏱️ Tempo total: ${(Date.now() - startTime)/1000} segundos`);

    logInfo('Teste Sprint 2 concluído com sucesso', { total_time: Date.now() - startTime });

  } catch (error) {
    if (runId) {
      await storage.finalizeRun(runId, {
        status: 'failed',
        execution_time_ms: Date.now() - startTime,
        error_message: error.message
      });
    }
    logInfo('Erro no teste Sprint 2', { error: error.message });
    console.error('❌ Falha:', error.message);
    process.exit(1);
  }
}

testSprint2();

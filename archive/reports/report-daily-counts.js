const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function startOfMonthUtc(year, month /* 1-12 */) {
  return new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
}
function endOfMonthUtc(year, month /* 1-12 */) {
  const d = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return d;
}
function endOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
}

function formatYYYYMMDD(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function dailyCounts(fromUtc, toUtc) {
  const { data, error } = await supabase
    .from('reviews')
    .select('create_time')
    .gte('create_time', fromUtc.toISOString())
    .lte('create_time', toUtc.toISOString())
    .limit(100000);

  if (error) throw new Error(error.message);

  // Inicializar dias com 0
  const day = new Date(fromUtc);
  const days = {};
  while (day <= toUtc) {
    days[formatYYYYMMDD(day)] = 0;
    day.setUTCDate(day.getUTCDate() + 1);
  }

  for (const row of data || []) {
    const d = new Date(row.create_time);
    const key = formatYYYYMMDD(d);
    if (days[key] !== undefined) days[key]++;
  }

  return days;
}

async function run() {
  const septFrom = new Date('2025-09-01T00:00:00Z');
  const septTo = endOfTodayUtc();
  const augFrom = new Date('2025-08-01T00:00:00Z');
  const augTo = new Date('2025-08-31T23:59:59Z');

  console.log('📊 Relatório diário – Setembro 2025');
  const sept = await dailyCounts(septFrom, septTo);
  let septTotal = 0;
  Object.entries(sept).forEach(([day, count]) => {
    septTotal += count;
    console.log(`${day}: ${count}`);
  });
  console.log(`Total Setembro: ${septTotal}`);
  console.log();

  console.log('📊 Relatório diário – Agosto 2025');
  const aug = await dailyCounts(augFrom, augTo);
  let augTotal = 0;
  Object.entries(aug).forEach(([day, count]) => {
    augTotal += count;
    console.log(`${day}: ${count}`);
  });
  console.log(`Total Agosto: ${augTotal}`);
}

if (require.main === module) {
  run().catch(err => {
    console.error('Erro no relatório:', err.message);
    process.exit(1);
  });
}



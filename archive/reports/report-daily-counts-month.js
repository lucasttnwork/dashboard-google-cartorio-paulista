const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bugpetfkyoraidyxmzxu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1Z3BldGZreW9yYWlkeXhtenh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY0MDM1NjAsImV4cCI6MjA3MTk3OTU2MH0.9qYGEjUf7fz4_KNAcvSZfaiYLlGZllSYxlvNhXmGGWU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function parseMonthArg(arg) {
  const m = /^\d{4}-\d{2}$/.exec(arg || '');
  if (!m) return null;
  const [y, mm] = arg.split('-').map(Number);
  if (mm < 1 || mm > 12) return null;
  return { year: y, month: mm };
}

function monthRangeUtc(year, month /*1-12*/) {
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { from, to };
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
    .eq('location_id', 'cartorio_paulista_main')
    .gte('create_time', fromUtc.toISOString())
    .lte('create_time', toUtc.toISOString())
    .limit(100000);
  if (error) throw new Error(error.message);

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
  const arg = process.argv[2];
  const parsed = parseMonthArg(arg);
  if (!parsed) {
    console.error('Uso: node report-daily-counts-month.js YYYY-MM');
    process.exit(1);
  }

  const { from, to } = monthRangeUtc(parsed.year, parsed.month);
  const days = await dailyCounts(from, to);
  let total = 0;
  console.log(`📊 Relatório diário – ${arg}`);
  Object.entries(days).forEach(([day, count]) => {
    total += count;
    console.log(`${day}: ${count}`);
  });
  console.log(`Total ${arg}: ${total}`);
}

if (require.main === module) {
  run().catch(err => {
    console.error('Erro no relatório mensal:', err.message);
    process.exit(1);
  });
}



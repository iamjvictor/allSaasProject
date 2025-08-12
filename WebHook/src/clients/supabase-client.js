const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

// Validação para garantir que as credenciais do Supabase estão configuradas
if (!config.supabaseUrl || !config.supabaseKey) {
  console.error('Erro: As variáveis de ambiente SUPABASE_URL e SUPABASE_KEY são obrigatórias.');
  console.error('Adicione-as ao seu arquivo .env e à configuração em config.js.');
  process.exit(1); // Encerra a aplicação se as chaves não estiverem presentes
}

const supabase = createClient(config.supabaseUrl, config.supabaseKey);

module.exports = supabase;

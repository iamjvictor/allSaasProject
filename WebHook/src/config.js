const path = require('path');
// Garante que o .env seja carregado a partir da raiz do projeto, independentemente de onde o script é executado.
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const config = {
  // Configurações do servidor
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Configurações da API Python
  pythonApiUrl: process.env.PYTHON_API_URL || 'https://apisaas.onrender.com/process_whatsapp_message',
  
  // Configurações de log
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Configurações de debug
  debug: process.env.NODE_ENV === 'development',

  // Configurações do Supabase
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_KEY,
};

module.exports = config; 
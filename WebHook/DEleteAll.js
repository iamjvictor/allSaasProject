// Script para apagar todos os usuários de auth.users no Supabase


// Configure suas variáveis de ambiente ou substitua pelos valores diretamente
const SUPABASE_URL = "https://epvztpawcgbdgyzmmoxk.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdnp0cGF3Y2diZGd5em1tb3hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTg1NzgxNywiZXhwIjoyMDY3NDMzODE3fQ.YnZMyVBBLaQlBYhd4v84Iwo3AVdDDm7U8I2KPRg-iMg";

// DEleteAll.js

// --- A CORREÇÃO ESTÁ AQUI ---
// Em vez de 'require', usamos 'import' para Módulos ES
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config'; // Para carregar as variáveis de ambiente

// --- CONFIGURAÇÃO DO CLIENTE SUPABASE ;---
const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("As variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
}

const supabase = createClient(supabaseUrl, supabaseKey);


/**
 * Limpa completamente o ambiente de desenvolvimento do Supabase.
 * Esta função é DESTRUTIVA e não deve ser usada em produção.
 */
async function cleanupSupabase() {
  console.log('--- INICIANDO LIMPEZA COMPLETA DO SUPABASE ---');

  // --- 1. LIMPEZA DOS BUCKETS ---
  const bucketsToClean = ['documents', 'room_images'];
  
  for (const bucket of bucketsToClean) {
    try {
      console.log(`A limpar o bucket: ${bucket}...`);
      const { data: files, error: listError } = await supabase.storage.from(bucket).list();
      if (listError) throw listError;

      if (files && files.length > 0) {
        const fileNames = files.map(file => file.name);
        await supabase.storage.from(bucket).remove(fileNames);
        console.log(`✅ ${fileNames.length} ficheiros removidos do bucket ${bucket}.`);
      } else {
        console.log(`🟡 O bucket ${bucket} já estava vazio.`);
      }
    } catch (error) {
      console.error(`❌ Erro ao limpar o bucket ${bucket}:`, error.message);
    }
  }

  // --- 2. LIMPEZA DAS TABELAS PÚBLICAS ---
  const tablesToClean = ['bookings', 'document_chunks', 'documents', 'google_integrations', 'leads', 'payments', 'room_types', 'profiles'];
  
  for (const table of tablesToClean) {
    try {
      console.log(`A limpar a tabela: ${table}...`);
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
      console.log(`✅ Tabela ${table} limpa com sucesso.`);
    } catch (error) {
      console.error(`❌ Erro ao limpar a tabela ${table}:`, error.message);
    }
  }
  
  // --- 3. EXCLUSÃO DOS UTILIZADORES DE AUTENTICAÇÃO ---
  try {
    console.log('A buscar e apagar todos os utilizadores de autenticação...');
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    if (!users || users.length === 0) {
      console.log('🟡 Nenhum utilizador de autenticação para apagar.');
      console.log('--- LIMPEZA CONCLUÍDA ---');
      return;
    }

    console.log(`Total de utilizadores encontrados: ${users.length}`);
    const deletePromises = users.map(user => supabase.auth.admin.deleteUser(user.id));
    const results = await Promise.allSettled(deletePromises);

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`✅ Utilizador ${users[index].id} apagado com sucesso.`);
      } else {
        console.error(`❌ Erro ao apagar o utilizador ${users[index].id}:`, result.reason.message);
      }
    });
    
  } catch (error) {
    console.error('❌ Erro inesperado ao apagar utilizadores de autenticação:', error.message);
  }

  console.log('--- LIMPEZA COMPLETA DO SUPABASE CONCLUÍDA ---');
}

// Executa a função
cleanupSupabase();
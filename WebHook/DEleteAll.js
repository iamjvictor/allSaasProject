// Script para apagar todos os usuários de auth.users no Supabase

const { createClient } = require('@supabase/supabase-js');

// Configure suas variáveis de ambiente ou substitua pelos valores diretamente
const SUPABASE_URL = "https://epvztpawcgbdgyzmmoxk.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVwdnp0cGF3Y2diZGd5em1tb3hrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTg1NzgxNywiZXhwIjoyMDY3NDMzODE3fQ.YnZMyVBBLaQlBYhd4v84Iwo3AVdDDm7U8I2KPRg-iMg";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function deleteAllUsers() {
  try {
    let users = [];
    let nextPage = null;

    // Paginação para buscar todos os usuários
    do {
      const { data, error } = await supabase.auth.admin.listUsers({
        page: nextPage,
        perPage: 1000,
      });

      if (error) {
        console.error('Erro ao listar usuários:', error);
        break;
      }

      if (data && data.users && data.users.length > 0) {
        users = users.concat(data.users);
        nextPage = data.nextPage;
      } else {
        nextPage = null;
      }
    } while (nextPage);

    console.log(`Total de usuários encontrados: ${users.length}`);

    for (const user of users) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (error) {
        console.error(`Erro ao deletar usuário ${user.id}:`, error);
      } else {
        console.log(`Usuário ${user.id} deletado com sucesso.`);
      }
    }

    console.log('Processo concluído.');
  } catch (err) {
    console.error('Erro inesperado:', err);
  }
}

deleteAllUsers();

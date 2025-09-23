const supabase = require("../clients/supabase-client");


class GoogleRepository {
 async getGoogleTokens(userId) {
    const { data, error } = await supabase
      .from('google_integrations')
      .select('access_token, refresh_token, expires_at, google_email')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Retorna null em vez de lançar erro se não encontrar, pois pode não ser um erro fatal
      if (error.code === 'PGRST116') return null; 
      throw error;
    }
    return data;
  }
async deleteGoogleTokens(userId) {
    const { error } = await supabase
      .from('google_integrations')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error("Erro ao deletar tokens do Google:", error);
      throw error;
    }
    return { success: true };
  }

  async hasGoogleIntegration(userId) {
    const { data, error } = await supabase
      .from('google_integrations')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle(); // Retorna o registro ou null, sem dar erro se não encontrar

    if (error) {
      console.error("Erro ao verificar integração do Google:", error);
      throw error;
    }

    return !!data; // Converte o resultado (objeto ou null) para um booleano (true ou false)
  }

  // Em src/repositories/integrationRepository.js


  // ...

  // Função para buscar a integração completa, incluindo os IDs do watch
  async getGoogleIntegration(googleEmail) {
    const { data, error } = await supabase
      .from('google_integrations')
      .select('*')
      .eq('google_email', googleEmail)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  // Função para salvar as informações da nova vigilância
  async updateWatchInfo(userId, resourceId, expiration) {
    const expirationDate = new Date(parseInt(expiration));
    const { error } = await supabase
      .from('google_integrations')
      .update({
        google_watch_resource_id: resourceId,
        google_watch_expiration: expirationDate.toISOString(),
      })
      .eq('user_id', userId);
    
    if (error) throw error;
  }

  // Função para buscar integração pelo watch_resource_id
  async getIntegrationByWatchId(watchResourceId) {
    const { data, error } = await supabase
      .from('google_integrations')
      .select('*')
      .eq('google_watch_resource_id', watchResourceId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }
}

 

module.exports = new GoogleRepository();

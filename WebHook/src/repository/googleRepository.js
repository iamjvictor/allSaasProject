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

 
}
module.exports = new GoogleRepository();

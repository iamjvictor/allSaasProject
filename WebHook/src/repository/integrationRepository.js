const supabase = require('../clients/supabase-client.js');
class IntegrationRepository {
  // ... (suas outras funções)

  /**
   * Encontra todas as integrações do Google cujo 'watch' vai expirar em breve.
   * @param {number} daysInAdvance - O número de dias de antecedência para a renovação. Padrão: 2 dias.
   * @returns {Promise<Array<object>>} Uma lista de integrações que precisam ser renovadas.
   */
  async findExpiringWatches(daysInAdvance = 2) {
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() + daysInAdvance);

    console.log(`REPOSITÓRIO: Buscando 'watches' que expiram antes de ${limitDate.toISOString()}`);

    const { data, error } = await supabase
      .from('google_integrations')
      .select('user_id') // Só precisamos do ID do perfil/hotel
      // A condição: a data de expiração é MENOR OU IGUAL à nossa data limite
      .lte('google_watch_expiration', limitDate.toISOString());

    if (error) {
      throw new Error(`Falha ao buscar 'watches' expirando: ${error.message}`);
    }
    
    return data || [];
  }

  async checkStripeIntegrationExists(userId) {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_id')
      .eq('id', userId)
      .single();

      console.log('Dados do perfil retornados do Supabase:', profile, profileError);

    return profile;
  }
}
module.exports = new IntegrationRepository();

const supabase = require('../clients/supabase-client');

class LeadsRepository {

  /**
   * Busca um lead pelo número de WhatsApp e ID do usuário.
   * Se não encontrar, cria um novo com status 'frio'.
   * É a porta de entrada para qualquer interação da IA.
   * @param {string} userId - O ID do dono do hotel (usuário do seu SaaS).
   * @param {string} whatsappNumber - O número de WhatsApp do cliente final.
   * @returns {Promise<object>} O perfil do lead, seja ele novo ou existente.
   */
  async findOrCreateByWhatsappNumber(userId, whatsappNumber) {
    if (!userId || !whatsappNumber) {
      throw new Error("UserID e WhatsApp Number são obrigatórios.");
    }
    console.log(`Buscando lead para o número: ${whatsappNumber}`);
    // 1. Primeiro, tentamos encontrar um lead que já exista
    const { data: existingLead, error: findError } = await supabase
      .from('leads')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_whatsapp', whatsappNumber)
      .single(); // .single() retorna um único objeto ou null, não um array

    if (findError && findError.code !== 'PGRST116') {
      // PGRST116 é o código para "nenhuma linha encontrada", o que não é um erro para nós.
      // Qualquer outro erro é um problema real.
      console.error("Erro ao buscar lead:", findError);
      throw findError;
    }

    // 2. Se o lead já existe, nós o retornamos
    if (existingLead) {
      console.log(`Lead existente encontrado: ${existingLead.id}`);
      return existingLead;
    }

    // 3. Se o lead não existe, criamos um novo
    console.log(`Nenhum lead encontrado. Criando um novo para o número: ${whatsappNumber}`);
    const { data: newLead, error: createError } = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        contact_whatsapp: whatsappNumber,
        // 'name' e 'email' ficam vazios, 'status' será 'frio' por padrão
      })
      .select()
      .single();

    if (createError) {
      console.error("Erro ao criar novo lead:", createError);
      throw createError;
    }

    console.log(`Novo lead criado: ${newLead.id}`);
    return newLead;
  }

  async createAnonymousLead(userId, leadName = 'Hóspede (Calendário)') {
    // Usamos um valor único e descritivo para o WhatsApp para evitar conflitos
    const placeholderWhatsapp = `google_event_${Date.now()}`;

    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        user_id: userId,
        contact_whatsapp: placeholderWhatsapp,
        name: leadName,
        status: 'quente', // Já é um lead quente, pois tem uma reserva
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao criar lead anônimo:", error);
      throw new Error("Falha ao criar lead anônimo para reserva externa.");
    }
    return newLead;
  }
  
  // No futuro, você adicionará outras funções aqui, como:
 // --- NOVAS FUNÇÕES DE ATUALIZAÇÃO ---

  /**
   * Atualiza o nome de um lead específico.
   * @param {number} leadId - O ID do lead a ser atualizado.
   * @param {string} newName - O novo nome do lead.
   * @returns {Promise<object>} O registro do lead atualizado.
   */
  async updateLeadName(userId, whatsappNumber, newName) {
    const { data, error } = await supabase
      .from('leads')
      .update({ name: newName })
      .match({ user_id: userId, contact_whatsapp: whatsappNumber }) // Usa .match() para a condição WHERE composta
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Atualiza o email de um lead específico.
   */
  async updateLeadEmail(userId, whatsappNumber, newEmail) {
    const { data, error } = await supabase
      .from('leads')
      .update({ email: newEmail })
      .match({ user_id: userId, contact_whatsapp: whatsappNumber })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Atualiza o status de um lead específico.
   */
  async updateLeadStatus(userId, whatsappNumber, newStatus) {
    const { data, error } = await supabase
      .from('leads')
      .update({ status: newStatus })
      .match({ user_id: userId, contact_whatsapp: whatsappNumber })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async findLeadById(leadId) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (error) throw error;
    return data;
  }
}

module.exports = new LeadsRepository();
const supabase = require('../clients/supabase-client');

class UserRepository {
  async findByWhatsappNumber(whatsappNumber) {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('whatsapp_number', whatsappNumber)
      .single();
    
    if (error) throw error;
    return data;
  }

  async create(userData) {
    console.log('🔄 Iniciando criação do usuário:', {
      ...userData,
      password: '[PROTECTED]'
    });

    // Primeiro, insere o usuário
    const { data: insertedUser, error: insertError } = await supabase
      .from('users')
      .insert({
        name: userData.name,
        email: userData.email,
        password: userData.password,
        whatsapp_number: userData.whatsapp_number,
        business_name: userData.business_name,
        business_location: userData.business_location,
        payment_gateway_id: userData.payment_gateway_id,
        pdf_vector: userData.pdf_vector
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Erro ao inserir usuário:', insertError);
      throw insertError;
    }

    if (!insertedUser) {
      throw new Error('Usuário não foi criado - nenhum dado retornado');
    }
    return insertedUser;
  }

  async findAllWithWhatsapp() {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, business_name, whatsapp_number')
      .not('whatsapp_number', 'is', null);
    
    if (error) throw error;
    return data;
  }
}

module.exports = new UserRepository();
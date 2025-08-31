const supabase = require('../clients/supabase-client');

class BookingRepository {

  /**
   * Cria uma nova reserva com um status inicial, geralmente 'pendente'.
   * Esta função é chamada antes de enviar o usuário para o gateway de pagamento.
   * @param {object} bookingData - Contém todos os detalhes da pré-reserva.
   * Ex: { userId, leadId, roomTypeId, checkIn, checkOut, totalPrice, paymentIntentId }
   * @returns {Promise<object>} O registro da reserva criada.
   */
  async createPendingBooking(bookingData) {
    const { 
      userId, 
      leadId, 
      roomTypeId, 
      checkInDate, 
      checkOutDate, 
      totalPrice, 
      paymentIntentId // O ID gerado pelo seu sistema de pagamento (ex: Stripe)
    } = bookingData;

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: userId,
        lead_id: leadId,
        room_type_id: roomTypeId,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        total_price: totalPrice,
        status: 'pendente', // Status inicial
        payment_intent_id: paymentIntentId, // Ligação com o pagamento
      })
      .select()
      .single();

    if (error) {
      console.error("Erro ao criar reserva pendente:", error);
      throw new Error(`Falha ao criar pré-reserva: ${error.message}`);
    }
    
    console.log(`Repository: Pré-reserva ${data.id} criada com sucesso.`);
    console.log(`paymentid é ${paymentIntentId}`);
    return data;
  }

  /**
   * Confirma uma reserva que estava pendente.
   * Chamado pelo webhook de pagamento após a confirmação.
   * @param {number} bookingId - O ID da reserva a ser confirmada.
   * @param {string} googleEventId - (Opcional) O ID do evento criado no Google Agenda.
   * @returns {Promise<object>} O registro da reserva atualizada.
   */
  async confirmBooking(bookingId, googleEventId = null) {
    const { data, error } = await supabase
      .from('bookings')
      .update({ 
        status: 'confirmada',
        google_calendar_event_id: googleEventId
      })
      .eq('id', bookingId)
      .select()
      .single();
    
    if (error) {
      console.error(`Erro ao confirmar reserva ${bookingId}:`, error);
      throw new Error(`Falha ao confirmar reserva: ${error.message}`);
    }

    console.log(`Repository: Reserva ${data.id} confirmada com sucesso.`);
    return data;
  }

  /**
   * Encontra uma reserva pendente usando um ID de intenção de pagamento.
   * Usado pelo webhook do Stripe para saber qual reserva confirmar.
   * @param {string} paymentIntentId - O ID da transação do gateway de pagamento.
   * @returns {Promise<object>} O registro da reserva encontrada.
   */
  async findByPaymentId(paymentIntentId) {
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('payment_intent_id', paymentIntentId)
      .eq('status', 'pendente') // Garante que só pegamos reservas que ainda não foram confirmadas
      .maybeSingle(); // Retorna o objeto, ou null se não encontrar, sem dar erro.

    if (error) {
      console.error(`Erro ao buscar reserva pelo ID de pagamento ${paymentIntentId}:`, error);
      throw new Error(`Falha ao buscar reserva por ID de pagamento: ${error.message}`);
    }

    return data;
  }
}

module.exports = new BookingRepository();
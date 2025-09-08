const axios = require('axios');

const supabase = require('../clients/supabase-client');
const RoomRepository = require('./roomRepository');
const { differenceInDays,format, parseISO } = require('date-fns');
const { ptBR } = require('date-fns/locale');
const leadsRepository = require('./leadsRepository');



class BookingRepository {

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


    const availableRooms = await this.checkAvailability(roomTypeId, checkInDate, checkOutDate);
    if (availableRooms < 1) {
      //enviar resposta para a IA
      return console.log("Não há quartos disponíveis para o período selecionado.");
    }

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
    return data.id;
  }
  async confirmBooking(bookingId, googleEventId) {
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

   async findByGoogleEventId(googleEventId) {
    const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('google_calendar_event_id', googleEventId)
        .maybeSingle(); // Retorna o objeto ou null, sem dar erro se não encontrar

    if (error) throw error;
    return data;
  }

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

  async checkAvailability(roomTypeId, checkInDate, checkOutDate, existingBookingId) {
    // 1. Busca o "estoque total" daquele tipo de quarto.

    console.log(`Verificando disponibilidade do quarto...`, roomTypeId, checkInDate, checkOutDate);
    const { data: roomType, error: roomError } = await supabase
      .from('room_types')
      .select('total_quantity')
      .eq('id', roomTypeId)
      .single();

    if (roomError) {
      // Se o roomTypeId não existir, não há vagas.
      if (roomError.code === 'PGRST116') return 0;
      throw new Error("Tipo de quarto não encontrado para verificação.");
    }
    const stockTotal = roomType.total_quantity;
    console.log(`checando reservas existentes...`);
    let query = supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('room_type_id', roomTypeId)
      .in('status', ['confirmada', 'pendente'])
      .lt('check_in_date', checkOutDate)
      .gt('check_out_date', checkInDate);

    if (existingBookingId) {
      query = query.neq('id', existingBookingId);
    }

    const { count, error: bookingError } = await query;

    if (bookingError) {
      console.error("Erro detalhado do Supabase ao verificar reservas existentes:", bookingError);
      throw new Error("Falha ao verificar as reservas existentes.");
    }
    
    const quartosOcupados = count || 0;
    console.log(`Quartos ocupados para ${roomTypeId} entre ${checkInDate} e ${checkOutDate}: ${quartosOcupados}`);
    
    // 3. O cálculo final
    const quartosDisponiveis = stockTotal - quartosOcupados;

    console.log(`Disponibilidade para quarto ${roomTypeId} [${checkInDate} a ${checkOutDate}]: ${quartosDisponiveis} de ${stockTotal}`);
    
    return quartosDisponiveis > 0 ? quartosDisponiveis : 0;
  }

  async filterExistingGoogleEvents(userId, googleEventIds) {
    if (!googleEventIds || googleEventIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('google_calendar_event_id')
      .eq('user_id', userId)
      .in('google_calendar_event_id', googleEventIds); // 'in' verifica se o valor está DENTRO do array

    if (error) {
      throw new Error(`Falha ao verificar eventos existentes: ${error.message}`);
    }

    // Retorna um array simples com os IDs encontrados, ex: ['evento123', 'evento456']
    return data.map(item => item.google_calendar_event_id);
  }
  async countAllConflictingBookings(userId, checkIn, checkOut) {
  const { data, error } = await supabase
    .from('bookings')
    .select('room_type_id')
    .eq('user_id', userId)
    .in('status', ['confirmada', 'confirmada_externamente', 'pendente'])
    .lt('check_in_date', checkOut)
    .gt('check_out_date', checkIn);

  if (error) {
    console.error("Erro ao contar todas as reservas conflitantes:", error);
    throw error;
  }

  // Agrupa e conta os resultados
  const counts = new Map();
  for (const booking of data) {
    counts.set(booking.room_type_id, (counts.get(booking.room_type_id) || 0) + 1);
  }
  return counts;
}
  
  //HANDLE RESPONSE OF WEBHOOK

  async createGoogleBooking(bookingData) {
    // 1. Verifica se já existe uma reserva com esse google_calendar_event_id
    const { data: existingBooking, error: findError } = await supabase
      .from('bookings')
      .select('*')
      .eq('google_calendar_event_id', bookingData.google_calendar_event_id)
      .maybeSingle();

    if (findError) {
      console.error(`Erro ao buscar reserva existente para o evento Google:`, findError);
      throw new Error(`Falha ao buscar reserva existente: ${findError.message}`);
    }

    let result;
    if (existingBooking) {
      // 2. Atualiza a reserva existente
      const { data, error } = await supabase
        .from('bookings')
        .update({
          user_id: bookingData.userId,
          lead_id: bookingData.leadId,
          room_type_id: bookingData.roomTypeId,
          check_in_date: bookingData.checkInDate,
          check_out_date: bookingData.checkOutDate,
          total_price: bookingData.totalPrice,
          status: bookingData.status,
          google_calendar_event_id: bookingData.google_calendar_event_id,
        })
        .eq('id', existingBooking.id)
        .select()
        .single();

      if (error) {
        console.error(`Erro ao atualizar evento do Google Calendar para o usuário ${bookingData.userId}:`, error);
        throw new Error(`Falha ao atualizar evento do Google Calendar: ${error.message}`);
      }

      console.log(`Evento do Google Calendar atualizado com sucesso para o usuário ${bookingData.userId}.`);
      result = data;
    } else {
      // 3. Cria uma nova reserva
      const { data, error } = await supabase
        .from('bookings')
        .insert({
          user_id: bookingData.userId,
          lead_id: bookingData.leadId,
          room_type_id: bookingData.roomTypeId,
          check_in_date: bookingData.checkInDate,
          check_out_date: bookingData.checkOutDate,
          total_price: bookingData.totalPrice,
          status: bookingData.status,
          google_calendar_event_id: bookingData.google_calendar_event_id,
        })
        .select()
        .single();

      if (error) {
        console.error(`Erro ao criar evento do Google Calendar para o usuário ${bookingData.userId}:`, error);
        throw new Error(`Falha ao criar evento do Google Calendar: ${error.message}`);
      }

      console.log(`Evento do Google Calendar criado com sucesso para o usuário ${bookingData.userId}.`);
      result = data;
    }

    console.log("agendamento criado/atualizado com id:", result.id);
    return result;
  }

  async deleteByGoogleEventId(googleEventId) {
    if (!googleEventId) return;

    console.log(`REPOSITÓRIO: Deletando reserva associada ao googleEventId: ${googleEventId}`);
    
    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('google_calendar_event_id', googleEventId);
    
    if (error) {
      console.error("Erro ao deletar reserva por googleEventId:", error);
      throw new Error("Falha ao deletar a reserva correspondente ao evento do calendário.");
    }
  }
}
module.exports = new BookingRepository();
const BookingRepository = require('../repository/bookingRepository');
const LeadRepository = require('../repository/leadsRepository');

const GoogleCalendarService = require('../services/googleCalendarService');
const roomRepository = require('../repository/roomRepository');
const paymentService = require('../services/paymentService');
const paymentRepository = require('../repository/paymentRepository');
const usersRepository = require('../repository/usersRepository');
const emailService = require('../services/emailService');

class BookingController{

    async createBookingWithPaymentLink(req, res) {
        try {
          const {
              user_id,
              lead_whatsapp_number,
              room_type_id, //ela deve re
              check_in_date, 
              check_out_date,
              total_price //calcular isso, buscando a diaria do quarto e multiplicando pela quantidade de diarias
          } = req.body;

          // 1. Encontra ou cria o lead para garantir que ele existe
          const lead = await LeadRepository.findOrCreateByWhatsappNumber(user_id, lead_whatsapp_number);

          // 2. Cria uma "Intenção de Pagamento" no Stripe
          const roomTypeDetails = await roomRepository.findByIdAndUserId(room_type_id, user_id);
          // 3. Cria a reserva no nosso banco com status 'pendente'
          const bookingData = {
              userId: user_id, //user.id,
              leadId: lead.id,
              roomTypeId: room_type_id,
              checkInDate: check_in_date,
              checkOutDate: check_out_date,
              totalPrice: total_price,
              //paymentIntent.id, // Liga a reserva à intenção de pagamento
          };
          const pendingBooking = await BookingRepository.createPendingBooking(bookingData);
          
          // 4. Gera o link de pagamento usando o serviço
          let checkoutResult;
          try {
            checkoutResult = await paymentService.createCheckoutSession(bookingData, pendingBooking, roomTypeDetails);
          } catch (checkoutError) {
            const hotelOwnerProfile = await usersRepository.getProfile(user_id);
            console.log("Perfil do dono do hotel:", hotelOwnerProfile);
            const hotelOwnerEmail = hotelOwnerProfile.email;
            const hotelOwnerName = hotelOwnerProfile.full_name;
            const leadWhatsappNumber = lead_whatsapp_number;    
           // 2. Gera um novo link de onboarding para ele corrigir o problema
            let onboardingLink = null;
            if (hotelOwnerProfile.stripe_id) {
              try {
                onboardingLink = await paymentService.createOnboardingLink(hotelOwnerProfile.stripe_id);
              } catch (onboardingError) {
                console.error(`❌ [ONBOARDING] Erro ao criar link:`, onboardingError);
              }
            }

            const errorDetails = checkoutError.message;
            await emailService.sendStripeErrorNotification(hotelOwnerEmail, onboardingLink, hotelOwnerName, errorDetails, leadWhatsappNumber);
            console.error("❌ [ERRO CHECKOUT] Erro ao criar checkout:", checkoutError);
            
            // Cancelar o agendamento criado em caso de erro no checkout
            try {
              await BookingRepository.cancelBooking(pendingBooking);
              console.log(`✅ [CANCELAMENTO] Agendamento ${pendingBooking} cancelado com sucesso`);
            } catch (cancelError) {
              console.error(`❌ [ERRO CANCELAMENTO] Falha ao cancelar agendamento ${pendingBooking}:`, cancelError);
            }
            
            throw new Error(`Falha ao gerar link de pagamento: ${checkoutError.message}`);
          }

          const paymentId = checkoutResult.paymentId;
          const paymentUrl = checkoutResult.paymentUrl;

          await BookingRepository.updatePaymentInfo(pendingBooking, paymentId);
          await LeadRepository.updateLeadStatus(user_id, lead_whatsapp_number, 'quente');
          res.status(201).json({ message: "Pré-reserva criada com sucesso!", bookingId: pendingBooking, paymentUrl: paymentUrl });
          
        }catch (err) {
          res.status(500).json({ message: err.message || "Erro interno do servidor." });
          return;
        }
        
    }
    async confirmBooking(req, res) {
        try {
        // O webhook do Stripe nos enviará o ID da intenção de pagamento
        console.log("Corpo da requisição de confirmação de reserva:", req.body);
        const { bookingID } = req.body;
       console.log(req.body);

        // 1. Encontra a reserva pendente no nosso banco de dados usando o ID do pagamento
        console.log("Buscando reserva pendente com ID:", bookingID);
        const pendingBooking = await BookingRepository.findBookingById(bookingID);
        console.log("Reserva pendente encontrada:", pendingBooking);

        if (!pendingBooking) {
            return res.status(404).json({ message: "Nenhuma reserva pendente encontrada para este pagamento." });
        }

        // 2. (Opcional, mas recomendado) Busca os dados do lead para usar na descrição do evento
        const lead = await LeadRepository.findLeadById(pendingBooking.lead_id);

        // 3. Chama o serviço para criar o evento no Google Agenda
        // Montamos um objeto com os detalhes que a agenda precisa
        const eventDetails = {
            check_in_date: pendingBooking.check_in_date,
            check_out_date: pendingBooking.check_out_date,
            guest_name: lead ? lead.name : 'Hóspede',
            total_price: pendingBooking.total_price,
            lead_whatsapp: lead ? lead.contact_whatsapp : 'Não informado',
            lead_email: lead ? lead.email : null,
            booking_id: pendingBooking.id
        };
        const googleEventId = await GoogleCalendarService.createEvent(pendingBooking.user_id, eventDetails);

        // 4. Com o evento criado, chama o repositório para FINALMENTE confirmar a reserva no nosso banco
        const confirmedBooking = await BookingRepository.confirmBooking(pendingBooking.id, googleEventId);

        const updateLead = await LeadRepository.updateLeadStatus(pendingBooking.user_id, lead.contact_whatsapp, 'cliente');
        const savePayment = await paymentRepository.savePayment(pendingBooking);

         const message = `Uhuul, ${eventDetails.guest_name}! 🎉 Sua reserva está confirmada.\n\n` +
                    `*Check-in:* ${eventDetails.check_in_date}\n` +
                    `*Check-out:* ${eventDetails.check_out_date}\n\n` +
                    `Preparamos tudo para a sua chegada. Mal podemos esperar para te receber!`;

    // 5. Chame a função do seu deviceController
        console.log(`Enviando mensagem do device [${deviceId}] para [${eventDetails.lead_whatsapp}] com o texto: ${message}`);
        const profile = await usersRepository.getProfile(pendingBooking.user_id);
        await deviceController.sendMessage(profile.deviceId, eventDetails.lead_whatsapp, message);
        

      

        res.status(200).json({ message: "Reserva confirmada com sucesso!", booking: confirmedBooking });

        } catch (err) {
        console.error("Erro ao confirmar reserva:", err);
        res.status(500).json({ message: "Erro interno do servidor." });
        }

    }
    async cancelBooking(req, res) {
        try {
            const { bookingId } = req.params;

            // 1. Busca a reserva no banco de dados
            const booking = await BookingRepository.findById(bookingId);

            if (!booking) {
                return res.status(404).json({ message: "Reserva não encontrada." });
            }

            // 2. Atualiza o status da reserva para 'cancelada'
            const canceledBooking = await BookingRepository.cancelBooking(bookingId);

            res.status(200).json({ message: "Reserva cancelada com sucesso!", booking: canceledBooking });

        } catch (err) {
            console.error("Erro ao cancelar reserva:", err);
            res.status(500).json({ message: "Erro interno do servidor." });
        }
    }

    async checkAvailability(req, res) {
    try {
      // Os parâmetros vêm da URL, ex: /availability?roomTypeId=1&...
      const { roomTypeId, checkInDate, checkOutDate } = req.query;

      if (!roomTypeId || !checkInDate || !checkOutDate) {
        return res.status(400).json({ message: "Parâmetros roomTypeId, checkInDate e checkOutDate são obrigatórios." });
      }

      const availableQuantity = await BookingRepository.checkAvailability(
        parseInt(roomTypeId, 10),
        checkInDate,
        checkOutDate
      );
      
      res.status(200).json({ 
        roomTypeId,
        checkInDate,
        checkOutDate,
        availableQuantity,
      });

    } catch (err) {
      console.error("Erro no controller ao checar disponibilidade:", err);
      res.status(500).json({ message: err.message || "Erro interno do servidor." });
    }
    }

    async  getAvailabilityReport(req, res) {
  // 1. Busca todos os tipos de quarto do hotel
    const { userId } = req.params; // ou req.user.id vindo do middleware
    const { checkIn: checkInDate, checkOut: checkOutDate, leadWhatsappNumber: lead_whatsapp_number } = req.body || req.query;
    
    console.log("🔍 [DEBUG] req.params:", req.params);
    console.log("🔍 [DEBUG] req.body:", req.body);
    console.log("🔍 [DEBUG] req.query:", req.query);
    console.log("🔍 [DEBUG] Parâmetros extraídos:", { userId, checkInDate, checkOutDate, lead_whatsapp_number });
    
    const allRoomTypes = await roomRepository.getRoomsByUserId(userId);
    

    console.log("testeando disponibilidade para os dias ",userId, checkInDate, checkOutDate, lead_whatsapp_number)
    
    try {
      // Primeiro, tenta encontrar ou criar o lead
      const lead = await LeadRepository.findOrCreateByWhatsappNumber(userId, lead_whatsapp_number);
      console.log("🔍 [DEBUG LEAD] Lead encontrado/criado:", lead);
      
      // Depois atualiza o status
      await LeadRepository.updateLeadStatus(userId, lead_whatsapp_number, 'morno');
      console.log("✅ Lead atualizado para Morno")
    } catch (leadError) {
      console.error("❌ [ERROR] Erro ao atualizar status do lead:", leadError);
      // Não interrompe o fluxo, apenas loga o erro
    }

  // 2. Busca a contagem de reservas para todas eles de uma vez
    const bookingCounts = await BookingRepository.countAllConflictingBookings(userId, checkInDate, checkOutDate);
    console.log("🔍 [DEBUG] bookingCounts Map:", bookingCounts);
    console.log("🔍 [DEBUG] bookingCounts entries:", Array.from(bookingCounts.entries()));
    // 3. Monta o relatório final
    const report = allRoomTypes.map(roomType => {
      const occupiedCount = bookingCounts.get(roomType.id) || 0;
      let availableCount;
      
      if (roomType.privacy === 'compartilhado') {
        // Para quartos compartilhados: occupiedCount = vagas ocupadas
        const totalSpots = roomType.total_quantity * roomType.capacity; // Total de vagas
        const occupiedSpots = occupiedCount; // Vagas ocupadas (já vem do banco)
        availableCount = totalSpots - occupiedSpots; // Vagas disponíveis
        console.log(`🔍 [DEBUG] Quarto Compartilhado ${roomType.id} (${roomType.name}): total_vagas=${totalSpots}, ocupadas=${occupiedSpots}, disponíveis=${availableCount}`);
      } else {
        // Para quartos privativos: occupiedCount = quartos ocupados
        availableCount = roomType.total_quantity - occupiedCount; // Quartos disponíveis
        console.log(`🔍 [DEBUG] Quarto Privativo ${roomType.id} (${roomType.name}): total=${roomType.total_quantity}, ocupados=${occupiedCount}, disponíveis=${availableCount}`);
      }
      
      return {
        id: roomType.id,
        name: roomType.name,  
        isAvailable: availableCount > 0,
        availableCount: availableCount, // Vagas para compartilhado, quartos para privativo
        dailyRate: roomType.daily_rate,
        
      };
    });
    console.log("🔍 [DEBUG] Relatório final:", report)
    res.status(200).json(report);
      } catch (err) {
      console.error("❌ [ERROR] Erro no getAvailabilityReport:", err);
      res.status(500).json({ message: err.message || "Erro interno do servidor." });
    }
    async callHumanAgent(req, res) {
      const { hotel_id, lead_whatsapp_number } = req.body;
      console.log("whaatpp", lead_whatsapp_number)
      const profile = await usersRepository.getProfile(hotel_id);
      const response = await emailService.sendCallHumanAgentEmail(profile.email, profile.full_name, lead_whatsapp_number);     
      console.log("🔍 [DEBUG] Email de atendimento humano enviado com sucesso!");
      res.status(200).json({ message: "Email de atendimento humano enviado com sucesso!" });
    }
}
  

module.exports = BookingController;
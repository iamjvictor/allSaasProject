const BookingRepository = require('../repository/bookingRepository');
const LeadRepository = require('../repository/leadsRepository');

const GoogleCalendarService = require('../services/googleCalendarService');
const roomRepository = require('../repository/roomRepository');
const paymentService = require('../services/paymentService');
const paymentRepository = require('../repository/paymentRepository');
const usersRepository = require('../repository/usersRepository');

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
      
          const checkoutResult = await paymentService.createCheckoutSession(bookingData,pendingBooking, roomTypeDetails);
          

          const paymentId = checkoutResult.paymentId;
          const paymentUrl = checkoutResult.paymentUrl;

        await BookingRepository.updatePaymentInfo(pendingBooking, paymentId);
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
    const { checkIn: checkInDate, checkOut: checkOutDate } = req.body;
    const allRoomTypes = await roomRepository.getRoomsByUserId(userId);

    console.log("testeando disponibilidade para os dias ",userId, checkInDate, checkOutDate)
    

  // 2. Busca a contagem de reservas para todas eles de uma vez
    const bookingCounts = await BookingRepository.countAllConflictingBookings(userId, checkInDate, checkOutDate);
    console.log(bookingCounts)
    // 3. Monta o relatório final
    const report = allRoomTypes.map(roomType => {
      const occupiedCount = bookingCounts.get(roomType.id) || 0;
      const availableCount = roomType.total_quantity - occupiedCount;
      
      return {
        id: roomType.id,
        name: roomType.name,  
        isAvailable: availableCount > 0,
        availableCount: availableCount,
        dailyRate: roomType.daily_rate,
        description: roomType.description, // Adicionando a descrição
      };
    });
    console.log(report)
    res.status(200).json(report);
  }
}
  

module.exports = BookingController;
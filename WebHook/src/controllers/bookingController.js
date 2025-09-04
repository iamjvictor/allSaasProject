const BookingRepository = require('../repository/bookingRepository');
const LeadRepository = require('../repository/leadsRepository');

const GoogleCalendarService = require('../services/googleCalendarService');

class BookingController{

  /**
   * Cria uma pré-reserva e gera um link de pagamento do Stripe.
   * Este é o endpoint principal que a IA chamará para iniciar uma reserva.
   */
    async createBookingWithPaymentLink(req, res) {
        try {
        // O 'user' (dono do hotel) vem do seu middleware de autenticação da IA
        //const { user } = req;
        
        // Dados que a IA enviará no corpo da requisição
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
        // Isso gera um ID único para a transação
        /*const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(total_price * 100), // O Stripe trabalha com centavos
            currency: 'brl',
            metadata: { 
            user_id: user.id,
            lead_id: lead.id,
            room_type_id: room_type_id,
            },
        }); */

        // 3. Cria a reserva no nosso banco com status 'pendente'
        const bookingData = {
            userId: user_id, //user.id,
            leadId: lead.id,
            roomTypeId: room_type_id,
            checkInDate: check_in_date,
            checkOutDate: check_out_date,
            totalPrice: total_price,
            paymentIntentId: "123456", //paymentIntent.id, // Liga a reserva à intenção de pagamento
        };
        const pendingBooking = await BookingRepository.createPendingBooking(bookingData);
        }catch (err) {
            console.log("Erro ao criar reserva pendente:", err);
        }
        // 4. Cria um link de pagamento do Stripe (Checkout Link)
        // Esta é a URL que será enviada para o WhatsApp do cliente final.
        /*const checkoutSession = await stripe.checkout.sessions.create({
            payment_intent: paymentIntent.id,
            line_items: [{
            price_data: {
                currency: 'brl',
                product_data: {
                name: `Reserva para quarto ${room_type_id}`, // Adicione o nome real do quarto aqui
                description: `Estadia de ${check_in_date} a ${check_out_date}`,
                },
                unit_amount: Math.round(total_price * 100),
            },
            quantity: 1,
            }],
            mode: 'payment',
            success_url: 'https://seu-site.com/reserva-confirmada', // Página de sucesso
            cancel_url: 'https://seu-site.com/reserva-cancelada',  // Página de cancelamento
        });

        res.status(201).json({ 
            message: "Pré-reserva criada com sucesso!", 
            booking: pendingBooking,
            payment_url: checkoutSession.url // A URL para enviar ao cliente
        });

        } catch (err) {
        console.error("Erro ao criar reserva com link de pagamento:", err);
        res.status(500).json({ message: "Erro interno do servidor." });
        }*/
    }
    async confirmBooking(req, res) {
        try {
        // O webhook do Stripe nos enviará o ID da intenção de pagamento
        //const { paymentIntentId } = req.body;
        const paymentIntentId = "1234567"

        // 1. Encontra a reserva pendente no nosso banco de dados usando o ID do pagamento
        const pendingBooking = await BookingRepository.findByPaymentId(paymentIntentId);
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
}
  // Futuramente, você pode adicionar outros métodos aqui, como:
  // async cancelBooking(req, res) { ... }
  // async getBookingDetails(req, res) { ... }

module.exports = BookingController;
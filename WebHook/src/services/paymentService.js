// src/services/payment.service.js
// This is your test secret API key.
const stripe = require('stripe')('sk_test_51S0R3DAzh8iKKBsjFPTOQoOx7BM6pGJkrsJ3QNHkxWxokHxDWdMbHztCPrNth4dICnGIuFQP6Tg6H06wN7Slh7fU00qidxNGtV');

const usersRepository = require('../repository/usersRepository');

// Defina a porcentagem da taxa da plataforma (por exemplo, 20% = 0.20)


class PaymentService {
  

  async createCheckoutSession(booking, pendingID, roomType) { // Adicionado ownerUserId
    try {
      if (!booking.userId) {
        throw new Error("ID do usuário dono do hotel é necessário para criar o pagamento com Stripe Connect.");
      }

      const PLATFORM_FEE_PERCENTAGE = 0.20; // 20%  
      // 1. Buscar o perfil do dono do hotel para obter o stripe_account_id
      const hotelOwnerProfile = await usersRepository.getProfile(booking.userId); // Assumindo método findByUserId
      
      if (!hotelOwnerProfile || !hotelOwnerProfile.stripe_id) {
        throw new Error(`Dono do hotel (ID: ${booking.userId}) não tem uma conta Stripe conectada. Por favor, complete o onboarding.`);
      }

      // Opcional: Verificar se a conta conectada está habilitada para charges
      // Se você monitorar 'stripe_charges_enabled' no seu DB
      // if (!hotelOwnerProfile.stripe_charges_enabled) {
      //   throw new Error("A conta Stripe do dono do hotel não está habilitada para receber pagamentos.");
      // }

      const hotelOwnerStripeAccountId = hotelOwnerProfile.stripe_id;

      // 2. Calcular o preço total em centavos
      const calculatedTotalPriceCents = Math.round(booking.totalPrice * 100);

      // 3. Calcular sua comissão (application_fee_amount) em centavos
      const applicationFeeAmount = Math.round(calculatedTotalPriceCents * PLATFORM_FEE_PERCENTAGE);

      // As URLs de sucesso e cancelamento
      const successUrl = `${process.env.FRONTEND_URL}/payment-status?status=success&booking_id=${booking.id}`;
      const cancelUrl = `${process.env.FRONTEND_URL}/payment-status?status=cancelled&booking_id=${booking.id}`;
       
      // 4. Cria a Sessão de Checkout com Stripe Connect
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'brl',
              product_data: {
                name: `Reserva: ${roomType.name}`,
                description: `Hospedagem de ${booking.checkInDate} a ${booking.checkOutDate}`,
              },
              unit_amount: calculatedTotalPriceCents,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          booking_id: pendingID,
          hotel_owner_user_id: booking.user_id, // ID do dono do hotel na sua plataforma
          hotel_owner_stripe_account_id: hotelOwnerStripeAccountId, // ID da conta conectada
        },
        // --- CONFIGURAÇÃO DO STRIPE CONNECT ---
        payment_intent_data: {
          application_fee_amount: applicationFeeAmount, // Sua comissão em centavos
          transfer_data: {
            destination: hotelOwnerStripeAccountId, // O ID da conta conectada do dono do hotel
          },
        },
      });

      console.log(`✅ Sessão de Checkout gerada para a reserva ${pendingID}. ID: ${session.id}. URL: ${session.url}`);
      
      return {
        paymentId: session.id,
        paymentUrl: session.url,
      };

    } catch (error) {
      console.error("❌ Erro ao criar Sessão de Checkout na Stripe com Connect:", error);
      // Mantenha a mensagem de erro detalhada para depuração, mas talvez menos detalhada para o usuário final.
      throw new Error(`Falha ao gerar o link de pagamento. ${error.message}`);
    }
  }
}

module.exports = new PaymentService();
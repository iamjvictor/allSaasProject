// src/services/payment.service.js
// This is your test secret API key.
const stripe = require('stripe')(`${process.env.STRIPE_SECRET_KEY}`);

const usersRepository = require('../repository/usersRepository');

// Defina a porcentagem da taxa da plataforma (por exemplo, 20% = 0.20)


class PaymentService {
  

  async createCheckoutSession(booking, pendingID, roomType) { // Adicionado ownerUserId
    try {
      if (!booking.userId) {
        throw new Error("ID do usuário dono do hotel é necessário para criar o pagamento com Stripe Connect.");
      }

   
      const hotelOwnerProfile = await usersRepository.getProfile(booking.userId); // Assumindo método findByUserId
      
      if (!hotelOwnerProfile || !hotelOwnerProfile.stripe_id) {
        throw new Error(`Dono do hotel (ID: ${booking.userId}) não tem uma conta Stripe conectada. Por favor, complete o onboarding.`);
      }

      const hotelOwnerStripeAccountId = hotelOwnerProfile.stripe_id;

      // Verificar se a conta conectada tem as capacidades necessárias
      const account = await stripe.accounts.retrieve(hotelOwnerStripeAccountId);
      
      console.log('🔍 [PAYMENT SERVICE] Status da conta Stripe:');
      console.log(`   - Account ID: ${account.id}`);
      console.log(`   - charges_enabled: ${account.charges_enabled}`);
      console.log(`   - transfers_enabled: ${account.transfers}`);
      console.log(`   - payouts_enabled: ${account.payouts_enabled}`);
      console.log(`   - capabilities:`, account.capabilities);
      console.log(`   - details_submitted: ${account.details_submitted}`);
      console.log(`   - requirements:`, account.requirements);
      
      if (!account.charges_enabled) {
        console.log('❌ [PAYMENT SERVICE] charges_enabled é false');
        throw new Error("A conta Stripe do dono do hotel não está habilitada para receber pagamentos. Complete o onboarding primeiro.");
      }
      
      // Verificar se as capacidades estão ativas (método mais confiável)
      if (account.capabilities?.transfers !== 'active' || account.capabilities?.card_payments !== 'active') {
        console.log('❌ [PAYMENT SERVICE] Capacidades não estão ativas:');
        console.log(`   - transfers: ${account.capabilities?.transfers}`);
        console.log(`   - card_payments: ${account.capabilities?.card_payments}`);
        throw new Error("A conta Stripe do dono do hotel não possui as capacidades necessárias ativas. Complete o onboarding primeiro.");
      }
      
      // Verificar se transfers_enabled existe e é true (para compatibilidade)
      if (account.transfers_enabled !== undefined && !account.transfers_enabled) {
        console.log('❌ [PAYMENT SERVICE] transfers_enabled é false');
        throw new Error("A conta Stripe do dono do hotel não está habilitada para transferências. Complete o onboarding primeiro.");
      }
      
      console.log('✅ [PAYMENT SERVICE] Conta Stripe está pronta para receber pagamentos');

      // 2. Calcular o preço total em centavos
      const calculatedTotalPriceCents = Math.round(booking.totalPrice * 100);
      // As URLs de sucesso e cancelamento
      const successUrl = `${process.env.FRONTEND_URL}/payment-status?status=success&booking_id=${pendingID}`;
      const cancelUrl = `${process.env.FRONTEND_URL}/payment-status?status=cancelled&booking_id=${pendingID}`;
       
      // 4. Cria a Sessão de Checkout com Stripe Connect (expira em 15 minutos)
      const expiresAt = Math.floor(Date.now() / 1000) + (30 * 60); // 15 minutos em segundos
    
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
        expires_at: expiresAt, // Sessão expira em 15 minutos
        metadata: {
          booking_id: pendingID,
          hotel_owner_user_id: booking.userId, // ID do dono do hotel na sua plataforma
          hotel_owner_stripe_account_id: hotelOwnerStripeAccountId, // ID da conta conectada
        },
      }, {
        stripeAccount: hotelOwnerStripeAccountId, // 👈 ESSENCIAL
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

  async createOnboardingLink(stripeAccountId) {
    try {
      console.log(`🔗 [ONBOARDING] Criando link para conta: ${stripeAccountId}`);
      
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);

      console.log(`✅ [DASHBOARD] Link de login criado: ${loginLink.url}`);
      return loginLink.url;
      
    } catch (error) {
      console.error(`❌ [ONBOARDING] Erro ao criar link:`, error);
      throw new Error(`Falha ao criar link de onboarding: ${error.message}`);
    }
  }

}

module.exports = new PaymentService();
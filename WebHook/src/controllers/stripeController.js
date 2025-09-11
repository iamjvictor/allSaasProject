// src/api/controllers/stripe.controller.js

//const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// This is your test secret API key.
const stripe = require('stripe')('sk_test_51S0R3DAzh8iKKBsjFPTOQoOx7BM6pGJkrsJ3QNHkxWxokHxDWdMbHztCPrNth4dICnGIuFQP6Tg6H06wN7Slh7fU00qidxNGtV');
// Importe os repositórios/serviços que você precisará para finalizar a reserva
const bookingRepository = require('../repository/bookingRepository');
const integrationRepository = require('../repository/integrationRepository');
const BookingController = require('./bookingController');
const bookingController = new BookingController();
const supabase = require('../clients/supabase-client');


// Pegue o "Segredo do endpoint" que a Stripe te deu e coloque no seu .env
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

class StripeController {
  async handleWebhook(req, res) {
    // A assinatura vem no header da requisição da Stripe
    const sig = req.headers['stripe-signature'];
    let event;
    console.log("Recebido WEBHOOK da Stripe:", req.body);

    try {
      // 1. VERIFICAÇÃO DE SEGURANÇA:
      // Confirma se a notificação veio mesmo da Stripe, usando o segredo.
      // É por isso que precisamos do 'req.body' bruto (raw).
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error(`❌ Erro na verificação da assinatura do webhook: ${err.message}`);
      // Informa à Stripe que houve um problema.
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 2. LIDAR COM O EVENTO DE SUCESSO
    // Verificamos se o tipo do evento é o que nos interessa: 'checkout.session.completed'
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const bookingId = session.metadata.booking_id;
      // Pega o ID do pagamento que guardamos nos metadados

      if (!bookingId) {
        console.error("Webhook da Stripe recebido sem booking_id nos metadados.");
        return res.status(400).send('Erro: booking_id faltando nos metadados.');
      }

      try {
          // === SIMULANDO REQ E RES PARA CHAMAR bookingController.confirmBooking ===
          const mockReq = {
            body: {
              bookingID: bookingId // Passa o booking_id no corpo da requisição simulada
            }
            // Você pode adicionar outras propriedades de req que seu confirmBooking possa usar, como user, etc.
            // params: { id: bookingId } // Se seu confirmBooking espera via params
          };

          const mockRes = {
            statusCode: 200, // Valor padrão, será sobrescrito pelo controller
            status: function(code) {
              this.statusCode = code;
              return this; // Retorna 'this' para permitir encadeamento .status().json()
            },
            json: function(data) {
              console.log("✅ Resposta simulada do confirmBooking:", data);
              // Você pode capturar a resposta JSON aqui se precisar
            },
            send: function(data) {
                console.log("✅ Resposta simulada do confirmBooking:", data);
            }
          };

          console.log(`🚀 Chamando bookingController.confirmBooking para bookingId: ${bookingId}`);
          await bookingController.confirmBooking(mockReq, mockRes);
          // FIM DA SIMULAÇÃO


        } catch (error) {
          console.error(`❌ Erro ao chamar confirmBooking ou confirmar reserva ${bookingId}:`, error);
          // Retornar 200 OK para a Stripe, mesmo com erro interno.
          return res.status(200).send('OK (Erro interno ao confirmar)');
        }
    }

    // 5. RESPOSTA DE SUCESSO PARA A STRIPE
    // Envia uma resposta 200 para a Stripe saber que recebemos a notificação com sucesso.
    res.status(200).json({ received: true });
  }

  // Exemplo de um controller corrigido
  async createOnboarding(req, res) {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID é obrigatório.' });
    }

    try {
      // Passo 1: Buscar o email do usuário na tabela 'auth.users' usando a chave de admin.
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);

      if (userError || !user) {
        console.error('Erro ao buscar usuário no sistema de autenticação:', userError);
        return res.status(404).json({ error: 'Usuário não encontrado no sistema de autenticação.' });
      }
      const userEmail = user.email;

      // Passo 2: Verificar se um 'stripe_id' já existe na tabela 'profiles'.
      const profile = await integrationRepository.checkStripeIntegrationExists(userId);
      console.log('Perfil retornado do repositório:', profile);
      const { error: profileError } = profile;
      if (profileError && profileError.code !== 'PGRST116') { // PGRST116: Ignora o erro "nenhuma linha encontrada"
        throw new Error(`Erro ao consultar perfil: ${profileError.message}`);
      }

      let accountId = profile?.stripe_id;

      // Passo 3: Se não houver 'accountId', criar uma nova conta Stripe Express.
      if (!accountId) {
        console.log(`Criando nova conta Stripe para o usuário: ${userId}`);
        const account = await stripe.accounts.create({
          type: 'express',
          email: userEmail,
          country: 'BR', // Defina o país padrão ou torne-o dinâmico
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
          metadata: {
            // É uma boa prática salvar seu ID de usuário na Stripe para referência cruzada
            user_id: userId,
          }
        });
        accountId = account.id;

        console.log(`Conta Stripe criada com sucesso. Account ID: ${account}`);

        // PASSO CRÍTICO: Salvar o novo ID da conta na sua tabela 'profiles'.
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ stripe_id: accountId })
          .eq('id', userId);

        if (updateError) {
          console.error('Falha CRÍTICA ao salvar o stripe_id no perfil:', updateError);
          // Considere deletar a conta Stripe órfã aqui para evitar problemas
          // await stripe.accounts.del(accountId);
          return res.status(500).json({ error: 'Falha ao salvar os detalhes da integração.' });
        }
      } else {
          console.log(`Conta Stripe existente encontrada para o usuário ${userId}: ${accountId}`);
      }

      // Passo 4: Criar o link de Onboarding (para contas novas) ou de Login (para contas existentes).
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `https://89406d00a79c.ngrok-free.app/profile`, // Redireciona para o perfil do usuário em caso de refresh
        return_url: `https://89406d00a79c.ngrok-free.app/dashboard`, // Retorna para o dashboard principal
        type: 'account_onboarding',
      });

      // Passo 5: Retornar a URL para o frontend.
      res.json({ url: accountLink.url });

    } catch (error) {
      console.error('Processo de onboarding do Stripe falhou:', error);
      res.status(500).json({ error: 'Ocorreu um erro inesperado durante a conexão com a Stripe.' });
    }
  }
  async getBalance(req, res) {
    try {
      // Passo 1: Autenticar o usuário a partir do token JWT no cabeçalho Authorization.
    // 1. Autenticação (como você já tem)
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) return res.status(401).json({ message: "Token inválido." });

    if (!user.id) {
      return res.status(401).json({ error: 'Não autorizado. Token de usuário inválido ou ausente.' });
    }

    // Passo 2: Buscar o 'stripe_id' do usuário no seu banco de dados (Supabase).
    // Esta é a etapa de segurança crucial para garantir que estamos consultando a conta correta.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_id')
      .eq('id', user.id)
      .single();
    console.log('Perfil retornado do Supabase:', profile);

    if (profileError || !profile || !profile.stripe_id) {
      console.warn(`Tentativa de buscar saldo para usuário ${user.id} sem conta Stripe conectada.`);
      return res.status(404).json({ error: 'Nenhuma conta Stripe encontrada para este usuário.' });
    }
    
    const stripeAccountId = profile.stripe_id;

    // Passo 3: Chamar a API da Stripe para buscar o saldo.
    // ESTA É A CHAVE PARA O SUCESSO:
    const balance = await stripe.balance.retrieve({
      // O parâmetro 'stripeAccount' diz à Stripe para executar esta chamada
      // no contexto da Conta Conectada, e não na sua conta de plataforma.
      stripeAccount: stripeAccountId,
    });

    // Passo 4: Retornar uma resposta limpa para o frontend.
    // O saldo vem em arrays (um por moeda), então pegamos o primeiro elemento.
    res.status(200).json({
      available: balance.available[0] || { amount: 0, currency: 'brl' },
      pending: balance.pending[0] || { amount: 0, currency: 'brl' },
    });

  } catch (error) {
    console.error(`Erro ao buscar saldo na Stripe para o usuário:`, error);
    res.status(500).json({ error: 'Falha ao comunicar com o serviço de pagamentos.' });
  }
}

}

module.exports = new StripeController();
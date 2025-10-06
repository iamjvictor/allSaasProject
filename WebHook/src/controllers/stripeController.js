// src/api/controllers/stripe.controller.js
const googleCalendarService = require('../services/googleCalendarService');
const googleRepository = require('../repository/googleRepository');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
// This is your test secret API key.

// Importe os repositórios/serviços que você precisará para finalizar a reserva
const bookingRepository = require('../repository/bookingRepository');
const integrationRepository = require('../repository/integrationRepository');
const BookingController = require('./bookingController');
const bookingController = new BookingController();
const supabase = require('../clients/supabase-client');
const deviceManager = require('../services/multi-device-manager');
const emailService = require('../services/emailService');
const usersRepository = require('../repository/usersRepository');


// Pegue o "Segredo do endpoint" que a Stripe te deu e coloque no seu .env
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

class StripeController {
  async handleWebhook(req, res) {
    // A assinatura vem no header da requisição da Stripe
    const sig = req.headers['stripe-signature'];
    let event;
    

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
    }else if (event.type === 'customer.subscription.created') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      
      console.log(`🆕 Nova subscription criada para customer: ${customerId}`);

      try {
        // Buscar o usuário pelo customer_id do Stripe
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, stripe_customer_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profileError || !profile) {
          console.error(`❌ Perfil não encontrado para customer ${customerId}:`, profileError);
          return res.status(200).send('OK (Perfil não encontrado)');
        }

        const priceId = subscription.items.data[0].price.id;

        // Validar e converter current_period_end
        let currentPeriodEndsAt = null;
        if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
          const date = new Date(subscription.current_period_end * 1000);
          if (!isNaN(date.getTime())) {
            currentPeriodEndsAt = date.toISOString();
          }
        }

        // Atualizar campos da tabela profile
        const updateData = {
          stripe_price_id: priceId,
          subscription_status: subscription.status
        };

        // Só adiciona current_period_ends_at se for válido
        if (currentPeriodEndsAt) {
          updateData.current_period_ends_at = currentPeriodEndsAt;
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', profile.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar perfil ${profile.id}:`, updateError);
          return res.status(200).send('OK (Erro ao atualizar perfil)');
        }

        console.log(`✅ Perfil ${profile.id} atualizado com nova subscription:`);
        console.log(`   - Price ID: ${priceId}`);
        console.log(`   - Status: ${subscription.status}`);
        if (currentPeriodEndsAt) {
          console.log(`   - Próximo período: ${currentPeriodEndsAt}`);
        }

      } catch (error) {
        console.error(`❌ Erro ao processar customer.subscription.created:`, error);
        return res.status(200).send('OK (Erro interno)');
      }
    }else if (event.type === 'customer.subscription.updated') {
      const object = event.data.object;
      const subscriptionId = object.id;
      console.log('escutando o updated');

      if (object.cancel_at_period_end) {
        console.log(`🗑️ Subscription cancelada para customer: ${subscriptionId}`);
        await this.handleSubscriptionCancelation(object.metadata.UserId, object.cancel_at);
        return res.status(200).send('OK (Subscription cancelada)');
      }
    }else if (event.type === 'customer.updated') {
      const object = event.data.object;
      const customerId = object.id;

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        
        limit: 1
      });
     

    
      if (subscriptions.data.length === 0) {
        console.error(`❌ Nenhuma subscription ativa encontrada para customer ${customerId}`);
        return res.status(200).send('OK (Subscription não encontrada)');
      }

      const subscription = subscriptions.data[0];
      const priceId = subscription.items.data[0].price.id;
     

      // Buscar o invoice para pegar o start_date
      
     

      try {
        // Buscar o usuário pelo customer_id do Stripe
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profileError || !profile) {
          console.error(`❌ Perfil não encontrado para customer ${customerId}:`, profileError);
          return res.status(200).send('OK (Perfil não encontrado)');
        }

        const priceId = subscription.items.data[0].price.id;
        console.log('priceId', priceId);

        // Validar e converter current_period_end
        let currentPeriodEndsAt = null;
        if (subscription.expires_at && typeof subscription.expires_at === 'number') {
          const date = new Date(subscription.expires_at * 1000);
          console.log('date', date);
          if (!isNaN(date.getTime())) {
            currentPeriodEndsAt = date.toISOString();
          }
        }

        // Atualizar campos da tabela profile
        const updateData = {
          stripe_price_id: priceId,
          subscription_status: subscription.status
        };

        // Só adiciona current_period_ends_at se for válido
        if (currentPeriodEndsAt) {
          updateData.current_period_ends_at = currentPeriodEndsAt;
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', profile.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar perfil ${profile.id}:`, updateError);
          return res.status(200).send('OK (Erro ao atualizar perfil)');
        }

        console.log(`✅ Perfil ${profile.id} atualizado com subscription modificada:`);
        console.log(`   - Price ID: ${priceId}`);
        console.log(`   - Status: ${subscription.status}`);
        if (currentPeriodEndsAt) {
          console.log(`   - Próximo período: ${currentPeriodEndsAt}`);
        }

        // Permitir acesso apenas se status for 'active' ou 'trialing'
        const allowedStatuses = ['active', 'trialing'];
        const shouldDisconnect = !allowedStatuses.includes(subscription.status);
        
        if (shouldDisconnect) {
          console.log(`⚠️ Subscription com status '${subscription.status}' para usuário ${profile.id} - Desconectando dispositivo Baileys`);
          
          try {
            // Usar a função centralizada de desconexão
            const result = await this.disconnectDevice(profile);
            
            if (!result.success) {
              console.log(`⚠️ Falha ao desconectar dispositivo: ${result.message || result.error}`);
            }
          } catch (deviceError) {
            console.error(`❌ Erro ao desconectar dispositivo:`, deviceError);
            // Não falha o webhook por causa do erro de dispositivo
          }

          // Se for past_due, enviar email com link do portal
          if (subscription.status === 'past_due') {
            console.log(`📧 Enviando email de atraso com link do portal para usuário ${profile.id}`);
            const fullProfile = await usersRepository.getProfile(profile.id);
            try {
              // Gerar link do portal
              const portalSession = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: `${process.env.FRONTEND_URL}/dashboard`,
              });

              // Enviar email de aviso de pagamento em atraso com link
              await emailService.sendPaymentOverdueNotification(
                fullProfile.email, 
                fullProfile.full_name || fullProfile.email,
                {
                  customerId,
                  currentPeriodEndsAt,
                  overdueDate: new Date().toISOString(),
                  portalUrl: portalSession.url
                }
              );
              console.log(`✅ Email de aviso de atraso com link enviado para ${fullProfile.email}`);
            } catch (emailError) {
              console.error(`❌ Erro ao enviar email de atraso:`, emailError);
              // Não falha o processo por erro de email
            }
          }
        }

        // Se status voltou para um status permitido, verificar se precisa reconectar
        if (!shouldDisconnect) {
          console.log(`✅ Subscription com status '${subscription.status}' para usuário ${profile.id} - Verificando conexão WhatsApp`);
          
          try {
            // Buscar o phone_number do perfil para identificar o dispositivo
            if (profile.whatsapp_number) {
              const whatsappNumber = profile.whatsapp_number;
              const deviceId = whatsappNumber.replace(/^\+55/, ''); // Para logs
              const fullDeviceId = `device-${deviceId}`;
              
              // Verificar se o dispositivo já está conectado
              const isAlreadyConnected = deviceManager.devices.has(fullDeviceId);
              
              if (isAlreadyConnected) {
                console.log(`ℹ️ Dispositivo ${deviceId} já está conectado. Pulando reconexão.`);
              } else {
                console.log(`🔌 Dispositivo ${deviceId} não está conectado. Iniciando reconexão...`);
                
                // Reconectar o dispositivo passando o número completo
                await deviceManager.reconnectDevice(whatsappNumber);
                
                console.log(`✅ Dispositivo ${deviceId} reconectado com sucesso`);
              }
            } else {
              console.log(`⚠️ Phone number não encontrado para o perfil ${profile.id}`);
            }
          } catch (deviceError) {
            console.error(`❌ Erro ao reconectar dispositivo:`, deviceError);
            // Não falha o webhook por causa do erro de dispositivo
          }
        }

      } catch (error) {
        console.error(`❌ Erro ao processar customer.subscription.updated:`, error);
        return res.status(200).send('OK (Erro interno)');
      }
    }else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const customerId = subscription.customer;
      try {
        // Buscar o usuário pelo customer_id do Stripe
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profileError || !profile) {
          console.error(`❌ Perfil não encontrado para customer ${customerId}:`, profileError);
          return res.status(200).send('OK (Perfil não encontrado)');
        }
       
        let currentPeriodEndsAt = null;
        if (subscription.current_period_end && typeof subscription.current_period_end === 'number') {
          const date = new Date(subscription.current_period_end * 1000);
          if (!isNaN(date.getTime())) {
            currentPeriodEndsAt = date.toISOString();
          }
        }

        try {
          // Usar a função centralizada de desconexão
          const result = await this.disconnectDevice(profile);
          
          if (!result.success) {
            console.log(`⚠️ Falha ao desconectar dispositivo: ${result.message || result.error}`);
          }
        } catch (deviceError) {
          console.error(`❌ Erro ao desconectar dispositivo:`, deviceError);
          // Não falha o webhook por causa do erro de dispositivo
        }
        if (!profile.whatsapp_number) {
          console.log(`⚠️ WhatsApp number não encontrado para o perfil ${profile.id}`);
          return { success: false, message: 'WhatsApp number não encontrado' };
        }
        const fullProfile = await usersRepository.getProfile(profile.id);
  
        // Enviar email de notificação de cancelamento
        try {
          await emailService.sendSubscriptionCancellationNotification(fullProfile.email, fullProfile.full_name, new Date().toISOString());
          console.log(`✅ Email de cancelamento enviado para ${fullProfile.email}`);
        } catch (emailError) {
          console.error(`❌ Erro ao enviar email de cancelamento:`, emailError);
          // Não falha o processo por erro de email
        }
      

        // Atualizar campos da tabela profile para refletir cancelamento
        const updateData = {
          subscription_status: 'canceled'
        };

        // Só adiciona current_period_ends_at se for válido
        if (currentPeriodEndsAt) {
          updateData.current_period_ends_at = currentPeriodEndsAt;
        }

        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', profile.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar perfil ${profile.id}:`, updateError);
          return res.status(200).send('OK (Erro ao atualizar perfil)');
        }
        // Remover pasta de sessão WhatsApp se existir
        if (profile.whatsapp_number) {
          const fs = require('fs');
          const path = require('path');
          // O diretório das sessões Baileys (ajuste conforme sua estrutura)
          const sessionsDir = path.join(__dirname, '..', '.sessions');
          const sessionFolder = path.join(sessionsDir, profile.whatsapp_number);
              // Apagar a pasta de sessão do dispositivo Baileys para evitar religação após reinício do servidor
     
          if (fs.existsSync(sessionFolder)) {
            try {
              fs.rmSync(sessionFolder, { recursive: true, force: true });
              console.log(`🗑️ Pasta de sessão ${sessionFolder} removida com sucesso`);
            } catch (fsErr) {
              console.error(`❌ Erro ao remover pasta de sessão ${sessionFolder}:`, fsErr);
              throw fsErr;
            }
          } else {
            console.log(`ℹ️ Pasta de sessão ${sessionFolder} não encontrada (já removida ou nunca criada)`);
          }

          
        } else {
          console.log(`ℹ️ WhatsApp number não encontrado no perfil ${profile.id}, pulando remoção de sessão`);
        }
        

        console.log(`✅ Perfil ${profile.id} atualizado com subscription cancelada:`);
        console.log(`   - Status: canceled`);
        if (currentPeriodEndsAt) {
          console.log(`   - Período final: ${currentPeriodEndsAt}`);
        }

      } catch (error) {
        console.error(`❌ Erro ao processar customer.subscription.deleted:`, error);
        return res.status(200).send('OK (Erro interno)');
      }
    }else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      
      console.log(`💳 Pagamento de invoice bem-sucedido para customer: ${customerId}`);

      try {
        // Buscar o usuário pelo customer_id do Stripe
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, stripe_customer_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profileError || !profile) {
          console.error(`❌ Perfil não encontrado para customer ${customerId}:`, profileError);
          return res.status(200).send('OK (Perfil não encontrado)');
        }

        // Buscar informações da subscription
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 1
        });
        

      
        if (subscriptions.data.length === 0) {
          console.error(`❌ Nenhuma subscription ativa encontrada para customer ${customerId}`);
          return res.status(200).send('OK (Subscription não encontrada)');
        }

        const subscription = subscriptions.data[0];
        const priceId = subscription.items.data[0].price.id;

        // Buscar o invoice para pegar o start_date
        const subscriptionInvoice = await stripe.subscriptions.retrieve(subscription.id);
    
        // Calcular data de vencimento baseada no start_date + 1 mês
        let currentPeriodEndsAt = null;
        if (subscriptionInvoice.start_date && typeof subscriptionInvoice.start_date === 'number') {
          const startDate = new Date(subscriptionInvoice.start_date * 1000);
          console.log('start_date:', startDate);
          
          // Adicionar 1 mês ao start_date
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 1);
          
          console.log('end_date (start + 1 mês):', endDate);
          
          if (!isNaN(endDate.getTime())) {
            currentPeriodEndsAt = endDate.toISOString();
          }
        }

        // Atualizar campos da tabela profile
        const updateData = {
          stripe_price_id: priceId,
          subscription_status: subscription.status,
          stripe_subscription_id: subscription.id
        };

        // Só adiciona current_period_ends_at se for válido
        if (currentPeriodEndsAt) {
          updateData.current_period_ends_at = currentPeriodEndsAt;
        }
        console.log('updateData:', updateData);

        const { error: updateError } = await supabase
          .from('profiles')
          .update(updateData)
          .eq('id', profile.id);

        if (updateError) {
          console.error(`❌ Erro ao atualizar perfil ${profile.id}:`, updateError);
          return res.status(200).send('OK (Erro ao atualizar perfil)');
        }

      } catch (error) {
        console.error(`❌ Erro ao processar invoice.payment_succeeded:`, error);
        return res.status(200).send('OK (Erro interno)');
      }
    }

    // 5. RESPOSTA DE SUCESSO PARA A STRIPE
    // Envia uma resposta 200 para a Stripe saber que recebemos a notificação com sucesso.
    res.status(200).json({ received: true });
  }
  // Função para verificar e atualizar capacidades da conta Stripe
  async checkAndUpdateAccountCapabilities(accountId) {
    try {
      console.log(`Verificando capacidades da conta Stripe: ${accountId}`);
      
      // Buscar informações da conta
      const account = await stripe.accounts.retrieve(accountId);
      
      console.log('Status da conta:', {
        id: account.id,
        charges_enabled: account.charges_enabled,
        transfers_enabled: account.transfers_enabled,
        capabilities: account.capabilities
      });

      // Verificar se as capacidades necessárias estão habilitadas
      const needsTransfers = !account.capabilities?.transfers || account.capabilities.transfers === 'inactive';
      const needsCardPayments = !account.capabilities?.card_payments || account.capabilities.card_payments === 'inactive';

      if (needsTransfers || needsCardPayments) {
        console.log('Atualizando capacidades da conta...');
        
        // Verificar se a conta está pronta para ter as capacidades ativadas
        if (!account.charges_enabled || !account.transfers_enabled) {
          console.log('⚠️ A conta ainda não está pronta para ativar capacidades. Status:');
          console.log(`- charges_enabled: ${account.charges_enabled}`);
          console.log(`- transfers_enabled: ${account.transfers_enabled}`);
          console.log('💡 O usuário precisa completar o onboarding primeiro.');
          return account;
        }
        
        // Atualizar capacidades da conta
        const updatedAccount = await stripe.accounts.update(accountId, {
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          }
        });

        console.log('Capacidades atualizadas:', updatedAccount.capabilities);
        return updatedAccount;
      } else {
        console.log('✅ Todas as capacidades já estão ativas!');
      }

      return account;
    } catch (error) {
      console.error('Erro ao verificar/atualizar capacidades da conta:', error);
      throw error;
    }
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

      // Passo 4: Verificar e atualizar capacidades da conta se necessário
      await this.checkAndUpdateAccountCapabilities(accountId);

      // Passo 5: Criar o link de Onboarding (para contas novas) ou de Login (para contas existentes).
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${process.env.FRONTEND_URL}/dashboard`, // Redireciona para o perfil do usuário em caso de refresh
        return_url: `${process.env.FRONTEND_URL}/dashboard`, // Retorna para o dashboard principal
        type: 'account_onboarding',
      });

      // Passo 6: Retornar a URL para o frontend.
      res.json({ url: accountLink.url });

    } catch (error) {
      console.error('Processo de onboarding do Stripe falhou:', error);
      res.status(500).json({ error: 'Ocorreu um erro inesperado durante a conexão com a Stripe.' });
    }
  }

  // Endpoint para verificar status da conta Stripe
  async checkAccountStatus(req, res) {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({ error: 'User ID é obrigatório.' });
      }

      // Buscar o perfil do usuário
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('stripe_id')
        .eq('id', userId)
        .single();

      if (profileError || !profile) {
        return res.status(404).json({ error: 'Perfil do usuário não encontrado.' });
      }

      if (!profile.stripe_id) {
        return res.status(400).json({ 
          error: 'Usuário não possui conta Stripe conectada.',
          needsOnboarding: true 
        });
      }

      // Verificar status da conta Stripe
      const account = await stripe.accounts.retrieve(profile.stripe_id);
      
      const status = {
        accountId: account.id,
        chargesEnabled: account.charges_enabled,
        transfersEnabled: account.transfers_enabled,
        capabilities: account.capabilities,
        isComplete: account.charges_enabled && account.transfers_enabled && 
                   account.capabilities?.transfers === 'active' && 
                   account.capabilities?.card_payments === 'active'
      };

      res.json(status);

    } catch (error) {
      console.error('Erro ao verificar status da conta Stripe:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
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

  async createSubscription(req, res) {
    try {
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) return res.status(401).json({ message: "Token inválido." });

    if (!user.id) {
      return res.status(401).json({ error: 'Não autorizado. Token de usuário inválido ou ausente.' });
    }
      const userId = user.id;
      const userEmail = user.email; // E o email

      const { priceId } = req.body;

      if (!priceId) {
        return res.status(400).json({ error: 'O ID do plano (priceId) é obrigatório.' });
      }

      // 1. Busca o perfil do utilizador para obter o stripe_customer_id
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      console.log('profile', profile);

      let customerId = profile.stripe_customer_id;
      console.log('customerId', customerId);
      
      // 2. Se o utilizador não for um cliente na Stripe, cria um agora.
      if (!customerId) {
        console.log(`📝 Criando novo customer no Stripe para usuário ${userId}`);
        const customer = await stripe.customers.create({
          email: userEmail,
          metadata: { supabaseUserId: userId }, // Liga o cliente Stripe ao seu utilizador
        });
        customerId = customer.id;
        
        // Salva o novo ID no seu banco de dados para futuras cobranças
        await supabase
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId);
        
        console.log(`✅ Novo customer criado: ${customerId}`);
      } else {
        // 3. Verificar se o customer existe no Stripe
        try {
          console.log(`🔍 Verificando customer existente: ${customerId}`);
          await stripe.customers.retrieve(customerId);
          console.log(`✅ Customer ${customerId} existe no Stripe`);
        } catch (stripeError) {
          if (stripeError.code === 'resource_missing') {
            console.log(`❌ Customer ${customerId} não existe no Stripe. Criando novo...`);
            
            // Customer não existe, criar um novo
            const customer = await stripe.customers.create({
              email: userEmail,
              metadata: { supabaseUserId: userId },
            });
            customerId = customer.id;
            
            // Atualizar no banco
            await supabase
              .from('profiles')
              .update({ stripe_customer_id: customerId })
              .eq('id', userId);
            
            console.log(`✅ Novo customer criado: ${customerId}`);
          } else {
            throw stripeError;
          }
        }
      }

      // 3. Cria a Sessão de Checkout no modo de assinatura
      console.log(`🔍 Criando sessão de checkout com:`);
      console.log(`   - Customer ID: ${customerId}`);
      console.log(`   - Price ID: ${priceId}`);
      console.log(`   - User Email: ${userEmail}`);
      
      let session;
      try {
        session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'subscription', // MUITO IMPORTANTE: Define a cobrança como recorrente
          customer: customerId,
          line_items: [
            {
              price: priceId, // O ID do preço do plano que veio do frontend
              quantity: 1,
            },
          ],
          allow_promotion_codes: true,
          // URLs para onde o utilizador será redirecionado
          success_url: `${process.env.FRONTEND_URL}/onboarding/planos?showUploadStep=true`,
          cancel_url: `${process.env.FRONTEND_URL}/onboarding/planos`, // Volta para a página de planos
        });
      } catch (sessionError) {
        console.error('❌ Erro específico na criação da sessão:', sessionError);
        console.error('❌ Código do erro:', sessionError.code);
        console.error('❌ Mensagem do erro:', sessionError.message);
        console.error('❌ Tipo do erro:', sessionError.type);
        throw sessionError;
      }

      console.log(`✅ Sessão de Checkout gerada para o usuário ${userId}. ID: ${session.id}. URL: ${session.url}`);

      // 4. Retorna o ID da sessão para o frontend
      res.status(200).json({ sessionId: session.id, url: session.url });

    } catch (error) {
      console.error('Erro ao criar sessão de assinatura:', error);
      res.status(500).json({ error: 'Falha ao iniciar o processo de subscrição.' });
    }
  }
  async  cancelSubscription(req, res) {
      
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
    
        // 1. Busca o perfil do utilizador para encontrar o ID da assinatura
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('stripe_subscription_id')
          .eq('id', user.id)
          .single();
    
        if (profileError || !profile?.stripe_subscription_id) {
          return res.status(404).json({ error: 'Nenhuma assinatura ativa encontrada para este utilizador.' });
        }
        
        const subscriptionId = profile.stripe_subscription_id;
    
        // 2. Chama a API da Stripe para agendar o cancelamento
        await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
          metadata: {
            UserId: user.id 
          }
        });
        
        // O status da assinatura no seu DB será atualizado pelo webhook que a Stripe envia
        // em resposta a esta chamada, mas é uma boa prática já o atualizar aqui.
        // O webhook irá confirmar esta mudança.
    
        res.status(200).json({ success: true, message: 'O seu plano será cancelado no final do período atual.' });
    
      } catch (error) {
        console.error('Erro ao agendar o cancelamento da assinatura:', error);
        res.status(500).json({ error: 'Falha ao processar o seu pedido de cancelamento.' });
      }
    
  }
  async createLoginLink(req, res) {
    try {
      const { stripeAccountId } = req.body;
      const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
      res.status(200).json({ url: loginLink.url });
    } catch (error) {
      console.error('Erro ao criar link de login:', error);
      res.status(500).json({ error: 'Falha ao criar link de login.' });
    }
  }
  async handleSubscriptionCancelation(customerId, cancel_at) {
    console.log('customerId', customerId);
    // Converte o timestamp cancel_at (em segundos) para uma data ISO string legível
    let cancelAtDate = null;
    if (cancel_at && typeof cancel_at === 'number') {
      const date = new Date(cancel_at * 1000);
      if (!isNaN(date.getTime())) {
        cancelAtDate = date.toISOString();
        console.log('Cancelamento agendado para:', cancelAtDate);
      }
    }
     const profile = await usersRepository.getProfile(customerId);
     console.log('profile', profile);
     await emailService.sendSubscriptionCancellationNotification(profile.email, profile.full_name, cancelAtDate)
     console.log('Email enviado para:', profile.email);
  }
  async createPortalSession(req, res) {
    try {
      // 1. Autenticar o usuário a partir do token JWT no cabeçalho Authorization
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) return res.status(401).json({ message: "Token inválido." });

      if (!user.id) {
        return res.status(401).json({ error: 'Não autorizado. Token de usuário inválido ou ausente.' });
      }

      // 2. Busca o perfil do utilizador para encontrar o seu ID de cliente na Stripe
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      
      const customerId = profile?.stripe_customer_id;
      if (!customerId) {
        // Este erro pode acontecer se o utilizador nunca tentou subscrever um plano
        return res.status(404).json({ error: 'Utilizador não encontrado no sistema de pagamentos.' });
      }

      // 3. Chama a API da Stripe para criar uma sessão do Portal de Faturação
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        // A URL para onde o utilizador será redirecionado após fechar o portal
        return_url: `${process.env.FRONTEND_URL}/dashboard`,
      });

      // 4. Retorna a URL segura e temporária do portal para o frontend
      res.status(200).json({ url: portalSession.url });
      
    } catch (error) {
      console.error("Erro ao criar sessão do portal da Stripe:", error);
      res.status(500).json({ error: 'Falha ao aceder à gestão da sua conta.' });
    }
  }    
  async disconnectDevice(profiles) {
    try {
      // Buscar perfil completo do usuário
      const profile = await usersRepository.getProfile(profiles.id);
      
     

      // Remover o código do país (+55) se presente
      const cleanPhone = profile.whatsapp_number.replace(/^\+55/, '');
      const deviceId = profile.device_id;
      
      console.log(`🔌 Desconectando dispositivo: ${deviceId}`);
      
      // Desconectar o dispositivo
      await deviceManager.disconnectDevice(deviceId);
      
      // Parar watch do Google Calendar e remover integração
      try {      
        // Buscar integração do Google para este usuário
        const integration = await googleRepository.getGoogleTokens(profile.id);
        
        if (integration && integration.watch_resource_id) {
          console.log(`📅 Parando watch do Google Calendar para usuário ${profile.id}`);
          await googleCalendarService.stopWatch(integration.watch_resource_id);
          
          // Apagar integração do Google
          console.log(`🗑️ Removendo integração do Google para usuário ${profile.id}`);
          await googleRepository.deleteGoogleTokens(profile.id);
          
          console.log(`✅ Integração do Google removida com sucesso`);
        } else {
          console.log(`ℹ️ Nenhuma integração do Google encontrada para usuário ${profile.id}`);
        }
      } catch (googleError) {
        console.error(`❌ Erro ao desconectar Google Calendar para usuário ${profile.id}:`, googleError);
        // Não falha o processo por erro do Google
      }
      
  
      
      console.log(`✅ Dispositivo ${deviceId} desconectado com sucesso`);
      return { success: true, deviceId, message: 'Dispositivo desconectado com sucesso' };

    } catch (error) {
      console.error(`❌ Erro ao desconectar dispositivo para perfil ${profile.id}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new StripeController();
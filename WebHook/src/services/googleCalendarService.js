const { google } = require('googleapis');
const googleRepository = require('../repository/googleRepository');
const BookingRepository = require('../repository/bookingRepository');
const RoomRepository = require('../repository/roomRepository');
const axios = require('axios');
const { differenceInDays, format, parseISO,subDays } = require('date-fns');
const { ptBR, tr } = require('date-fns/locale');
const leadsRepository = require('../repository/leadsRepository');
const bookingRepository = require('../repository/bookingRepository');

// Função auxiliar para formatar datas no padrão brasileiro

function formatIsoToBrasilia(isoDateString) {
  if (!isoDateString) return "Não informado";
  
  // 1. Converte a string ISO para um objeto de Data do JavaScript
  const date = parseISO(isoDateString);
  
  // 2. Formata a data para o padrão brasileiro
  // 'PPPPpppp' é um token que gera a data e hora completas com fuso horário local.
  // Você pode customizar o formato como quiser.
  // Ex: 'dd/MM/yyyy HH:mm' -> "02/09/2025 19:36"
  const formattedDate = format(date, "dd 'de' MMMM 'de' yyyy, 'às' HH:mm", {
    locale: ptBR,
  });

  return formattedDate;
}

class GoogleCalendarService {  
  async createEvent(userId, eventDetails) {
    console.log(`SERVICE: Iniciando criação de evento no Google Agenda para o usuário ${userId}`);

    // 1. BUSCA AS CREDENCIAIS (TOKENS) DO GOOGLE PARA ESTE USUÁRIO NO BANCO
    const tokens = await googleRepository.getGoogleTokens(userId);
    console.log(`SERVICE: Tokens obtidos do repositório:`, tokens);

    // Se o usuário não conectou o Google Agenda, a função para silenciosamente.
    if (!tokens || !tokens.refresh_token) {
      console.log(`Usuário ${userId} não possui integração com Google Agenda. Pulando criação de evento.`);
      return null;
    }

    // 2. CONFIGURA O CLIENTE DE AUTENTICAÇÃO COM AS CREDENCIAIS DO USUÁRIO

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({
      refresh_token: tokens.refresh_token,
    });

    console.log("REFRESH TOKEN---- ", tokens.refresh_token);

    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    } catch (err) {
      console.error("Erro ao renovar access token:", err.message);
      throw new Error("Refresh token inválido ou revogado");
    }

    console.log("CLIENTE: Credenciais do OAuth2 configuradas.", oauth2Client);
    // 3. CRIA A INSTÂNCIA DA API DO CALENDÁRIO JÁ AUTENTICADA
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    // 4. MONTA O OBJETO DO EVENTO COM OS DETALHES DA RESERVA
    const checkOutDate = new Date(eventDetails.check_out_date);
    checkOutDate.setDate(checkOutDate.getDate() + 2);

    // Formata a data para o formato YYYY-MM-DD
    const year = checkOutDate.getFullYear();
    const month = String(checkOutDate.getMonth() + 1).padStart(2, '0'); // Os meses são de 0 a 11
    const day = String(checkOutDate.getDate()).padStart(2, '0');
    const nextDay = `${year}-${month}-${day}`;
    console.log("DATA DE CHECK-OUT AJUSTADA PARA O GOOGLE:", nextDay);  

    const event = {
      summary: `Reserva: ${eventDetails.guest_name || 'Hóspede'}`,
      description: `
        Nova reserva confirmada via AutoBooks.
        --------------------------------
        **Hóspede:** ${eventDetails.guest_name || 'Não informado'}
        **Contato (WhatsApp):** ${eventDetails.lead_whatsapp}
        **Contato (Email):** ${eventDetails.lead_email || 'Não informado'}
        **Check-in:** ${eventDetails.check_in_date}
        **Check-out:** ${eventDetails.check_out_date}
        **Valor Total:** R$ ${eventDetails.total_price}
        --------------------------------
        ID da Reserva no Sistema: ${eventDetails.booking_id}
      `,
      start: {
        date: eventDetails.check_in_date,
      },
      end: {
        date: nextDay,
      },
      // Adiciona o email do hóspede como um convidado no evento, se existir
      attendees: eventDetails.lead_email ? [{ email: eventDetails.lead_email }] : [],
    };    
    try {
      // 5. INSERE O EVENTO NA AGENDA PRINCIPAL ('primary') DO DONO DO HOTEL
      const createdEvent = await calendar.events.insert({
        auth: oauth2Client,
        calendarId: 'primary',
        resource: event,
        sendNotifications: true, // Opcional: envia um convite para o hóspede
      });

      const eventId = createdEvent.data.id;
      console.log(`SERVICE: Evento criado com sucesso no Google Agenda. ID: ${eventId}`);
      
      // Retorna o ID do evento para ser salvo na sua tabela 'bookings'
      return eventId;

    } catch (err) {
      console.error("Erro ao criar evento no Google Calendar:", err.message);
      // Se a autorização falhar (ex: tokens revogados), a função falha, mas não quebra a aplicação.
      // O controller que a chamou pode decidir o que fazer.
      throw new Error("Falha ao criar evento no Google Calendar.");
    }
  }
 async watchCalendar(userId, googleEmail) {
    console.log(`SERVICE: Renovando 'watch' no calendário do usuário ${googleEmail}...`);
    
    const oauth2Client = await this.getAuthenticatedClient(userId);
    if (!oauth2Client) {
      throw new Error("Não foi possível autenticar com o Google para iniciar o monitoramento.");
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // 1. PRIMEIRO, buscamos a informação da vigilância antiga no nosso banco
    const existingIntegration = await googleRepository.getGoogleIntegration(googleEmail); // Você precisará criar esta função

    // 2. SE EXISTIR uma vigilância antiga, tentamos pará-la
    if (existingIntegration && existingIntegration.google_watch_resource_id) {
      try {
        console.log("Parando watch antigo...");
        await calendar.channels.stop({
          requestBody: {
            id: userId, // O 'channelId' que usamos
            resourceId: existingIntegration.google_watch_resource_id, // O 'resourceId' que salvamos
          }
        });
        console.log("Watch antigo parado com sucesso.");
      } catch (stopError) {
        // Ignoramos erros aqui, pois o canal pode já ter expirado, o que é normal.
        console.warn("Não foi possível parar o watch antigo (pode já ter expirado):", stopError.message);
      }
    }

      // 3. AGORA, criamos o novo 'watch'
    try {
      const response = await calendar.events.watch({
        calendarId: 'primary',
        requestBody: {
          id: userId,  // O ID único para este canal (nosso userId)
          type: 'web_hook',
          address: `${process.env.API_BASE_URL}/api/integrations/google/webhook`, // A URL do seu webhook
        },
      });
      
      const { id, resourceId, expiration } = response.data;
      console.log("Monitoramento do calendário iniciado/renovado:", response.data);

      // 4. SALVAMOS os novos IDs no banco para podermos pará-lo no futuro
      await googleRepository.updateWatchInfo(userId, resourceId, expiration); // Você precisará criar esta função

      return response.data;

    } catch (err) {
      console.error("Erro ao iniciar o monitoramento do calendário:", err.response ? err.response.data : err.message);
      throw new Error("Falha ao configurar o monitoramento do calendário.");
    }
  }

  // Função auxiliar para evitar repetição de código
  async getAuthenticatedClient(userId) {
    const tokens = await googleRepository.getGoogleTokens(userId);
    if (!tokens || !tokens.refresh_token) return null;

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    oauth2Client.setCredentials({ refresh_token: tokens.refresh_token });
    return oauth2Client;
  }

  async syncRecentEvents(userId) {
    
    const oauth2Client = await this.getAuthenticatedClient(userId);
    if (!oauth2Client) return;
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    // Busca eventos que foram atualizados recentemente
    const response = await calendar.events.list({
      calendarId: 'primary',
      showDeleted: true,
      updatedMin: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // Últimos 2 minutos
    });
    const events = response.data.items;
    if (!events || events.length === 0) {
      console.log("Sincronização: Nenhum evento recente encontrado no Google Calendar.");
      return;
    }

   
    
    for (const event of events) {
      try {
        // --- LÓGICA DE DECISÃO ---

        if (event.status === 'cancelled') {
          // CENÁRIO 1: O EVENTO FOI DELETADO NO GOOGLE
          console.log(`Evento ${event.id} foi cancelado. Tentando remover do sistema...`);
          // Chama o repositório para deletar a reserva correspondente
          await BookingRepository.deleteByGoogleEventId(event.id); 
          // 'continue' pula para o próximo evento do loop
          continue; 
        }

        // CENÁRIO 2: O EVENTO FOI CRIADO OU ATUALIZADO
        // A sua função 'createOrUpdateFromGoogleEvent' já lida com criação e atualização
        // graças à lógica de "UPSERT". Ela continua perfeita para este caso.
        console.log(`Evento ${event.id} foi criado/atualizado. Sincronizando...`);
        await this.createOrUpdateFromGoogleEvent(userId, event);

      } catch (error) {
        // Isola a falha: se um evento der erro, loga e continua para o próximo
        console.error(`Falha ao processar o evento do Google com ID ${event.id}:`, error.message);
      }
    }
  }

   async renewCalendarWatch(userId) {
    console.log(`RENOVAÇÃO: Iniciando para o usuário ${userId}`);
    return this.watchCalendar(userId);
  }

  async createOrUpdateFromGoogleEvent(userId, event) {
   console.log(`SINCRONIZAÇÃO: Processando evento do Google Calendar ID: ${event.id}`);

    

    const roomCatalog = await RoomRepository.getRoomsByUserId(userId);
    if (!roomCatalog || roomCatalog.length === 0) {
      throw new Error(`Nenhum quarto cadastrado para o usuário ${userId}. Impossível sincronizar.`);
    }
    const availableRoomNames = roomCatalog.map(room => room.name);
    const createdDateFormatted = formatIsoToBrasilia(event.created);

    const promptPayload = {
      event: {
        id: event.id,
        summary: event.summary,
        description: event.description,
        start: event.start.date,
        end: event.end.date,
        created: createdDateFormatted,
      },
      user: {
        id: userId,
        availableRooms: availableRoomNames,
      },
    };

    console.log("Payload enviado para a IA:", promptPayload);

    //CHAMA IA 
    let extractedData;
    try {
      const aiResponse = await axios.post(
        `${process.env.IA_BASE_URL}/handleWebhook`, // Seu endpoint de IA
        promptPayload,
        // { headers: { 'Authorization': `Bearer ${process.env.AI_API_SECRET}` } } // Se sua IA tiver autenticação
      );
      extractedData = aiResponse.data;
    } catch (aiError) {
      console.error("Erro ao chamar a API da IA:", aiError.message);
      throw new Error("Falha ao comunicar com o serviço de IA.");
    }
    
    console.log("IA retornou dados extraídos:", extractedData.response);

    const targetRoom = roomCatalog.find(room => room.name.toLowerCase() === extractedData.response.roomName?.toLowerCase());

    console.log("Quarto escolhido pela IA:", targetRoom.id);

    //quarto não encontrado
    if (!targetRoom) {
      console.log(`IA sugeriu um quarto ("${extractedData.roomName}") que não foi encontrado no catálogo. Pulando evento.`);
      return null;
    }
    console.log(`Quarto identificado para a reserva: ${targetRoom.name} (ID: ${targetRoom.id})`);

    let leadId;
    let anonymousLead = null;
    // --- A LÓGICA DE VERIFICAÇÃO QUE VOCÊ PEDIU ---
    if (extractedData.response.leadWhatsapp) {
      // CAMINHO FELIZ: A IA encontrou um número de WhatsApp
      const cleanWhatsapp = extractedData.response.leadWhatsapp.replace(/\D/g, '');
      const lead = await leadsRepository.findOrCreateByWhatsappNumber(userId, cleanWhatsapp);
      
      // Atualiza o lead com os outros dados extraídos
      if (extractedData.response.leadName) await leadsRepository.updateLeadName(userId, lead.contact_whatsapp, extractedData.response.leadName);
      if (extractedData.response.leadEmail) await leadsRepository.updateLeadEmail(userId, lead.contact_whatsapp, extractedData.response.leadEmail);
      
      leadId = lead.id;

    } else {
      // CAMINHO ALTERNATIVO: A IA NÃO encontrou um número de WhatsApp
      console.log("Nenhum WhatsApp encontrado. Criando um lead anônimo...");
      anonymousLead = await leadsRepository.createAnonymousLead(userId, extractedData.response.leadName);
      leadId = anonymousLead.id;
    }
    const checkInDateStr = event.start.date || event.start.dateTime;
    const checkOutDateStr = event.end.date || event.end.dateTime;

    // 2. Calcula o número de noites.
    //    A função 'differenceInDays' faz exatamente o que precisamos.
    //    Para uma estadia de 12 a 13, a diferença é 1 noite.
    const difDays = differenceInDays(
        parseISO(checkOutDateStr),
        parseISO(checkInDateStr)
    );
    const numberOfNights = difDays-1;
    // 3. Pega o preço da diária do quarto que encontramos
    const dailyRate = targetRoom.daily_rate;
    // 4. Calcula o preço total
    //    Adicionamos uma verificação para garantir que temos os dados necessários.
    const totalPrice = numberOfNights > 0 && dailyRate > 0 ? numberOfNights * dailyRate : 0;
    console.log(`Cálculo do Preço: ${numberOfNights} noites * R$${dailyRate} = R$${totalPrice}`);
    
    const googleEndDate = parseISO(checkOutDateStr);
    //    ...e subtrai um dia para obter a data de check-out real.
    const actualCheckOutDate = subDays(googleEndDate, 1);
    
    // Formata de volta para o padrão 'YYYY-MM-DD'
    const eventCheckout = actualCheckOutDate.toISOString().split('T')[0];
    const existingBooking = await BookingRepository.findByGoogleEventId(event.id);

    const availableQuantity = await bookingRepository.checkAvailability(
      targetRoom.id,
      event.start.date,
      eventCheckout,
      existingBooking ? existingBooking.id : null
    );
    let bookingData;
    if (availableQuantity > 0 && !anonymousLead) {
      // 3.1. SE HÁ VAGA: Cria a reserva com status 'confirmada'
      console.log(`Disponibilidade OK para o quarto ${targetRoom.id}. Criando reserva para o lead ${leadId}.`);

     bookingData = {
      userId: userId,
      leadId: leadId,
      totalPrice: totalPrice,
      roomTypeId: targetRoom.id,
      checkInDate: event.start.date,
      checkOutDate: eventCheckout,
      status: 'confirmada',
      google_calendar_event_id: event.id,
      };
    
    } else if (availableQuantity > 0 && anonymousLead) {
      console.log(`Disponibilidade OK para o quarto ${targetRoom.id}. Criando reserva com lead anonimo, confira sua reserva`);
      bookingData = {
      userId: userId,
      leadId: leadId,
      totalPrice: totalPrice,
      roomTypeId: targetRoom.id,
      checkInDate: event.start.date,
      checkOutDate: eventCheckout,
      status: 'confirmada',
      google_calendar_event_id: event.id,
      };
      
    } else {
      // 3.2. SE NÃO HÁ VAGA: Loga o problema e cria a reserva com status 'pendente'
      console.log(`Sem disponibilidade para o quarto ${targetRoom.id}.`);
      //envia mensagem para o numero e email do usuario via userID, informando que naquela data não tem vagas.
      return null;
      
    }
   
     await bookingRepository.createGoogleBooking(bookingData);
    

    

    return true;
  }
}

module.exports = new GoogleCalendarService();
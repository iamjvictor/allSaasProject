const { google } = require('googleapis');
const googleRepository = require('../repository/googleRepository');

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
    const event = {
      summary: `Reserva: ${eventDetails.guest_name || 'Hóspede'}`,
      description: `
        Nova reserva confirmada via AutoBooks.
        --------------------------------
        **Hóspede:** ${eventDetails.guest_name || 'Não informado'}
        **Contato (WhatsApp):** ${eventDetails.lead_whatsapp}
        **Contato (Email):** ${eventDetails.lead_email || 'Não informado'}
        **Valor Total:** R$ ${eventDetails.total_price}
        --------------------------------
        ID da Reserva no Sistema: ${eventDetails.booking_id}
      `,
      start: {
        // A API do Google espera datas no formato ISO 8601
        dateTime: new Date(eventDetails.check_in_date).toISOString(),
        timeZone: 'America/Sao_Paulo', // Considere tornar isso configurável no futuro
      },
      end: {
        dateTime: new Date(eventDetails.check_out_date).toISOString(),
        timeZone: 'America/Sao_Paulo',
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
}

module.exports = new GoogleCalendarService();
require('dotenv').config();
const { google } = require('googleapis');
const fetch = require('node-fetch');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 1️⃣ Cria URL de autorização
function generateAuthUrl() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const scopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline', // Garante refresh_token
    prompt: 'consent',
    scope: scopes,
  });

  console.log('Abra essa URL no navegador e autorize:\n', url);
  return oauth2Client;
}

async function main() {
  const oauth2Client = generateAuthUrl();

  // 2️⃣ Pergunta o code retornado pelo Google
  rl.question('\nCole aqui o "code" que o Google retornou: ', async (code) => {
    try {
      // Troca code por tokens
      const { tokens } = await oauth2Client.getToken(code);
      console.log('Tokens obtidos do Google:', tokens);

      // Salva refresh_token
      if (!tokens.refresh_token) {
        console.warn('⚠️ Atenção: nenhum refresh_token foi emitido. Certifique-se de usar "prompt: consent" e um navegador anônimo.');
      }

      oauth2Client.setCredentials(tokens);

      // 3️⃣ Cria um evento de teste no calendário
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      const event = {
        summary: 'Evento de Teste AutoBooks',
        description: 'Evento criado para testar integração do Google Calendar',
        start: {
          dateTime: new Date(Date.now() + 60 * 1000).toISOString(), // daqui 1 minuto
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // +1h
          timeZone: 'America/Sao_Paulo',
        },
        attendees: [{ email: process.env.TEST_CALENDAR_EMAIL }],
      };

      const createdEvent = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendNotifications: true,
      });

      console.log('✅ Evento criado com sucesso!', createdEvent.data.id);
    } catch (err) {
      console.error('Erro:', err.response?.data || err.message);
    } finally {
      rl.close();
    }
  });
}

main();

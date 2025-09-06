const express = require('express');
const WhatsAppDeviceManager = require('./src/services/multi-device-manager');
const supabase = require('./src/clients/supabase-client'); // Corrigido para usar o cliente exportado
const { z } = require('zod'); // 1. Importe o Zod
const bcrypt = require('bcryptjs'); // Importe a biblioteca de hash
const qrcodeTerminal = require('qrcode-terminal');
const qr = require('qr-image'); // Add this at the top of your file with other requires
const fs = require('fs');
const deviceManager = new WhatsAppDeviceManager();
const app = express();
const userRepository = require('./src/repository/usersRepository'); // Corrigido para usar o repositório exportado
const cors = require('cors');
const authRoutes = require('./src/routes/authRoutes'); // Importe suas rotas de autenticação
const roomRoutes = require('./src/routes/roomRoutes')
const userRoutes = require('./src/routes/userRoutes');
const uploadRoutes = require('./src/routes/uploadRoutes');
const leadsRoutes = require('./src/routes/leadsRoutes');
const bookingRoutes = require('./src/routes/booksRoutes');
const integrationRoutes = require('./src/routes/integrationRoutes');
const cronRoutes = require('./src/routes/cronRoutes');

const deviceRoutes = require('./src/routes/deviceRoutes');


app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/users', userRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/cron', cronRoutes);
app.use('/api/devices', deviceRoutes);

app.get('/qrcode/:whatsappNumber', async (req, res) => {
  const { whatsappNumber } = req.params;
  if (!whatsappNumber) {
    return res.status(400).json({ error: 'O número do WhatsApp é obrigatório na URL.' });
  }

  const normalizedWhatsAppNumber = normalizePhoneNumber(whatsappNumber);
  const deviceId = `device-${normalizedWhatsAppNumber}`;

  try {
    // 1. Verifica se o dispositivo já está conectado
    const existingDevice = deviceManager.devices.get(deviceId);

    if (existingDevice && existingDevice.connected) {
      return res.status(200).json({ message: 'Dispositivo já está conectado.' });
    }

    // 2. Se não estiver conectado, busca os dados do usuário no banco
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('whatsapp_number', normalizedWhatsAppNumber)
      .single();

    if (userError || !userData) {
      console.error('Erro ao buscar usuário ou usuário não encontrado:', userError);
      return res.status(404).json({ error: 'Usuário não encontrado para este número de WhatsApp.' });
    }

    // 3. Monta a configuração e inicia a conexão para gerar o QR Code
    const deviceConfig = {
      id: deviceId,
      name: `Dispositivo ${userData.business_name || userData.name}`,
      authPath: `auth_info_baileys_${normalizedWhatsAppNumber}`,
      user_id: userData.id,
      whatsappNumber: normalizedWhatsAppNumber,
    };
    

    // Agora esperamos diretamente pela promessa que retorna o QR Code
    const qrCodeBase64 = await deviceManager.connectDevice(deviceConfig, true);
      
    if (!qrCodeBase64) {
      return res.status(500).json({ error: 'Não foi possível gerar o QR Code a tempo.' });
    }
    

    res.status(200).json({ qrCodeBase64 });

  } catch (error) {
    console.error(`Erro ao gerar QR Code para ${whatsappNumber}:`, error);
    res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
  }
});

// Endpoint para obter estatísticas do histórico de conversas
app.get('/chat-history/stats', async (req, res) => {
  try {
    const stats = deviceManager.getChatHistoryStats();
    res.status(200).json(stats);
  } catch (error) {
    console.error('Erro ao obter estatísticas do histórico:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// Endpoint para obter histórico de um usuário específico
app.get('/chat-history/:whatsappNumber', async (req, res) => {
  try {
    const { whatsappNumber } = req.params;
    const history = deviceManager.getChatHistoryForUser(whatsappNumber);
    res.status(200).json({
      whatsappNumber,
      history,
      messageCount: history.length
    });
  } catch (error) {
    console.error('Erro ao obter histórico:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// Endpoint para limpar histórico de um usuário específico
app.delete('/chat-history/:whatsappNumber', async (req, res) => {
  try {
    const { whatsappNumber } = req.params;
    deviceManager.clearChatHistory(whatsappNumber);
    res.status(200).json({ 
      message: 'Histórico limpo com sucesso.',
      whatsappNumber 
    });
  } catch (error) {
    console.error('Erro ao limpar histórico:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

// Endpoint para limpar todo o histórico
app.delete('/chat-history', async (req, res) => {
  try {
    deviceManager.chatHistory.clear();
    res.status(200).json({ 
      message: 'Todo o histórico foi limpo com sucesso.' 
    });
  } catch (error) {
    console.error('Erro ao limpar todo o histórico:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
});

app.listen(4000, async () => {
  console.log('🚀 API de cadastro rodando na porta 4000');
  await deviceManager.reconnectAllDevices();
});

// Função para reconectar todos os dispositivos automaticamente

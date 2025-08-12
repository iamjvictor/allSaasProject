const express = require('express');
const WhatsAppDeviceManager = require('./services/multi-device-manager');
const supabase = require('./clients/supabase-client'); // Corrigido para usar o cliente exportado
const { z } = require('zod'); // 1. Importe o Zod
const bcrypt = require('bcryptjs'); // Importe a biblioteca de hash
const qrcodeTerminal = require('qrcode-terminal');
const qr = require('qr-image'); // Add this at the top of your file with other requires
const fs = require('fs');
const deviceManager = new WhatsAppDeviceManager();
const app = express();
const userRepository = require('./repository/usersRepository'); // Corrigido para usar o repositório exportado

app.use(express.json());

// 2. Defina o esquema de validação para o corpo da requisição
const registerSchema = z.object({
  name: z.string({ required_error: "O nome é obrigatório." }).min(2, "O nome deve ter pelo menos 2 caracteres."),
  email: z.string({ required_error: "O e-mail é obrigatório." }).email({ message: "Formato de e-mail inválido." }),
  password: z.string({ required_error: "A senha é obrigatória." }).min(8, "A senha deve ter pelo menos 8 caracteres."),
  whatsappNumber: z.string({ required_error: "O número do WhatsApp é obrigatório." }).min(10, "Número de WhatsApp inválido."),
  businessName: z.string().optional(),
  businessLocation: z.object({
    address: z.string(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
  }).optional(),
  paymentGatewayId: z.string().optional(),
  pdf_vector: z.object({
    content: z.string({ required_error: "O conteúdo do PDF (content) é obrigatório dentro de pdf_vector." })
  }).optional(),
});

// Helper para garantir que o número de telefone esteja em um formato consistente (apenas dígitos)
const normalizePhoneNumber = (phone) => phone.replace(/\D/g, '');


app.post('/register', async (req, res) => {
  // Declara a variável no escopo principal da função
  let insertedUser; 

  try {
    // 1. Validação e Normalização
    const validatedData = registerSchema.parse(req.body);
    const normalizedWhatsAppNumber = normalizePhoneNumber(validatedData.whatsappNumber);

    
    // 2. Verifica se o usuário já existe
    const existingUser = await supabase
      .from('users')
      .select('id, name, email')
      .eq('whatsapp_number', normalizedWhatsAppNumber)
      .single();
      
    if (existingUser) {
      console.log('⚠️ Usuário já existe:', existingUser);
      return res.status(409).json({
        error: 'Este número de WhatsApp já está cadastrado.',
      });
    }
    console.log('Dados validados:', existingUser);
    // 3. Criptografa a senha
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);
    const userData = {
        name: validatedData.name,
        email: validatedData.email,
        password: hashedPassword,
        whatsapp_number: normalizedWhatsAppNumber,
        business_name: validatedData.businessName ,
        business_location: validatedData.businessLocation,
        payment_gateway_id: validatedData.paymentGatewayId,
        pdf_vector: validatedData.pdf_vector 
      };
      console.log('🕵️‍♂️ Objeto exato que será inserido:', JSON.stringify(validatedData, null, 2));
    // 4. Executa a inserção no banco de dados
    // O objeto de inserção é montado diretamente aqui
    console.log('Dados antes do insert:', userData);
    const { data: user, error: insertError } = await supabase
      .from('users')
      .insert(userData);
      

    // Lança um erro se a inserção falhar, para ser pego pelo catch principal
    if (insertError) {
      throw insertError;
    }
    

console.log('Resultado do insert:', insertResult);
    const { data: userReturn, error: selectError } = await supabase
    .from('users')
    .select('*')
    .eq('whatsapp_number', normalizedWhatsAppNumber)
    .single();

    
    // Atribui o resultado à variável de escopo mais alto
    insertedUser = user;

    // 5. Verifica se o usuário foi realmente criado
    if (!insertedUser || !insertedUser.id) {
      throw new Error('Erro ao criar usuário - dados não retornados pelo banco');
    }

    // 6. Configura e conecta o dispositivo
    const deviceConfig = {
      id: `device-${normalizedWhatsAppNumber}`,
      name: `Dispositivo ${validatedData.businessName || validatedData.name}`,
      user_id: insertedUser.id, // Usa o ID do usuário recém-criado
      whatsappNumber: normalizedWhatsAppNumber,
    };
    const qrCodeBase64 = await deviceManager.connectDevice(deviceConfig);

    if (!qrCodeBase64) {
      return res.status(500).json({ error: 'Não foi possível gerar o QR Code a tempo.' });
    }

    // 7. Retorna a resposta de sucesso
    res.status(201).json({
      message: 'Usuário registrado com sucesso! Escaneie o QR Code para conectar o WhatsApp.',
      user: { id: insertedUser.id, email: insertedUser.email, name: insertedUser.name },
      qrCodeBase64
    });

  } catch (error) {
    // Um único bloco catch para tratar todos os erros (validação, banco, etc.)
    console.error('❌ Erro detalhado no endpoint /register:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos.',
        details: error.flatten().fieldErrors,
      });
    }
    res.status(500).json({
      error: 'Ocorreu um erro interno no servidor.',
      details: error.message
    });
  }
});

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

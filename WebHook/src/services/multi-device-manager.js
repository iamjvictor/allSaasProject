const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const config = require('../config');
const QRCode = require('qrcode'); 
const fs = require('fs/promises');
const fsSync = require('fs');  // Add this line for sync operations
const path = require('path');
const supabase = require('../clients/supabase-client');


class WhatsAppDeviceManager {
  constructor() {
    this.devices = new Map();
    this.deviceConfigs = [];
    this.chatHistory = new Map();
    this.connectionFile = 'active_connections.json';
    this.sessionsDir = path.join(__dirname, '..', '..', '.sessions');
    
    // Create sessions directory if it doesn't exist
    if (!fsSync.existsSync(this.sessionsDir)) {  // Use fsSync instead of fs
      fsSync.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  // Função para extrair o número do WhatsApp do JID
  extractWhatsAppNumber(jid) {
    if (!jid) return '';
    const [number] = jid.split('@')[0].split(':');
    return number;
  }

  // Função para gerar user_id baseado no número do WhatsApp
  generateUserId(whatsappNumber) {
    const cleanNumber = whatsappNumber.replace(/\D/g, '');
    const lastDigits = cleanNumber.slice(-9);
    return parseInt(lastDigits, 10);
  }

  // Função para gerenciar histórico de conversas
  getChatHistory(whatsappNumber) {
    if (!this.chatHistory.has(whatsappNumber)) {
      this.chatHistory.set(whatsappNumber, []);
    }
    return this.chatHistory.get(whatsappNumber);
  }

  // Função para adicionar mensagem ao histórico
  addToChatHistory(whatsappNumber, sender, message) {
    const history = this.getChatHistory(whatsappNumber);
    history.push({
      sender: sender,
      message: message,
      timestamp: new Date().toISOString()
    });

    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    this.chatHistory.set(whatsappNumber, history);
  }

  // Função para formatar histórico para a API
  formatChatHistory(whatsappNumber) {
    const history = this.getChatHistory(whatsappNumber);
    if (history.length === 0) return "";

    return history.map(entry => {
      const role = entry.sender === 'user' ? 'Usuário' : 'Victor';
      return `${role}: ${entry.message}`;
    }).join('\n');
  }

  // Função para limpar histórico de um usuário específico
  clearChatHistory(whatsappNumber) {
    this.chatHistory.delete(whatsappNumber);
    console.log(`🧹 Histórico limpo para ${whatsappNumber}`);
  }

  // Função para obter histórico de um usuário específico
  getChatHistoryForUser(whatsappNumber) {
    return this.getChatHistory(whatsappNumber);
  }

  // Função para obter estatísticas do histórico
  getChatHistoryStats() {
    const stats = {
      totalConversations: this.chatHistory.size,
      conversations: []
    };

    for (const [whatsappNumber, history] of this.chatHistory) {
      stats.conversations.push({
        whatsappNumber,
        messageCount: history.length,
        lastMessage: history.length > 0 ? history[history.length - 1].timestamp : null
      });
    }

    return stats;
  }

 async prepareSessionDir(deviceConfig, forceNew) {
  const deviceSessionDir = path.join(this.sessionsDir, deviceConfig.whatsappNumber);

  if (!fsSync.existsSync(deviceSessionDir)) {
    fsSync.mkdirSync(deviceSessionDir, { recursive: true });
  }

  if (forceNew) {
    try {
      await fs.rm(deviceSessionDir, { recursive: true, force: true });
      await fs.mkdir(deviceSessionDir, { recursive: true });
       const configPath = path.join(deviceSessionDir, 'device_config.json');
      await fs.writeFile(configPath, JSON.stringify(deviceConfig, null, 2));
    console.log(`[INFO] [${deviceId}] ✅ Ficheiro de configuração salvo com sucesso em ${configPath}`);
      console.log(`🧹 Old session removed for ${deviceConfig.name}`);
    } catch (err) {
      console.warn(`⚠️ Could not remove old session (may not exist): ${err.message}`);
    }
  }

  return deviceSessionDir;
}

setupConnectionEvents(sock, deviceConfig, saveCreds, resolve, reject, connectionTimeout) {
  let qrGenerated = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    const device = this.devices.get(deviceConfig.id);

    // 🔹 QR Code
    if (qr && !qrGenerated) {
      qrGenerated = true;
      clearTimeout(connectionTimeout);
      const qrImage = await QRCode.toDataURL(qr);
      require('qrcode-terminal').generate(qr, { small: true });
      resolve(qrImage);
    }

    // 🔹 Conexão fechada
    if (connection === 'close') {
      if (device) device.connected = false;
      const reason = (lastDisconnect.error)?.output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      if (reason === DisconnectReason.loggedOut) {
        clearTimeout(connectionTimeout);
        reject(new Error('Dispositivo desconectado pelo usuário.'));
      } else if (shouldReconnect) {
        this.connectDevice(deviceConfig, false).catch(err => {
          console.error(`[Reconexão Automática] Erro ao tentar reconectar ${deviceConfig.name}: ${err.message}`);
        });
      }
    }

    // 🔹 Conexão aberta
    if (connection === 'open') {
      if (device) device.connected = true;

      const connectedNumber = this.extractWhatsAppNumber(sock.user.id);
      const expectedNumber = deviceConfig.whatsappNumber;

      if (connectedNumber !== expectedNumber) {
        console.error(`❌ VERIFICAÇÃO FALHOU para ${deviceConfig.name}.`);
        await sock.logout();

        if (device) {
          device.connected = false;
          device.error = 'Número de WhatsApp incorreto escaneado.';
        }
        return;
      }

      console.log(`✅ ${deviceConfig.name} conectado com sucesso! 📱 ${connectedNumber}`);
      clearTimeout(connectionTimeout);
      resolve('CONNECTED');
    }
  });

  // 🔹 Aqui usa o saveCreds corretamente
  sock.ev.on('creds.update', saveCreds);
}


setupMessageHandler(sock, deviceConfig) {
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (msg.key.fromMe) {
        console.log(`📤 Eu enviei: ${msg.message?.conversation || JSON.stringify(msg.message)}`);
    } else {
        console.log(`📥 Recebi: ${msg.message?.conversation || JSON.stringify(msg.message)}`);
    }

    const userQuestion = msg.message?.conversation || 
                         msg.message?.extendedTextMessage?.text;

    if (!userQuestion || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const whatsappNumber = this.extractWhatsAppNumber(from);

    try {
      this.addToChatHistory(whatsappNumber, 'user', userQuestion);
      const chatHistory = this.formatChatHistory(whatsappNumber);

      const pythonResponse = await axios.post(config.pythonApiUrl, {
        user_id: deviceConfig.user_id,
        message: userQuestion,
        chat_history: chatHistory
      });

      const aiResponse = pythonResponse.data.response_gemini;
      this.addToChatHistory(whatsappNumber, 'assistant', aiResponse);

      await sock.sendMessage(from, { text: aiResponse });

    } catch (error) {
      console.error(`❌ ${deviceConfig.name} - Erro:`, error.message);
      await sock.sendMessage(from, { 
        text: 'Opa, deu um probleminha aqui pra conectar com a IA. Tenta de novo daqui a pouco!' 
      });
    }
  });
}

async connectDevice(deviceConfig, forceNew = false) {
  
  

  return new Promise(async (resolve, reject) => {
    try {
      const deviceSessionDir = await this.prepareSessionDir(deviceConfig, forceNew);
      const { state, saveCreds } = await useMultiFileAuthState(deviceSessionDir);
   
      

      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
      }); 

      // Timeout de conexão
      const connectionTimeout = setTimeout(() => {
        reject(new Error('Timeout: A geração do QR Code demorou demais.'));
      }, 20000);

      // Setup eventos principais
      this.setupConnectionEvents(sock, deviceConfig,saveCreds, resolve, reject, connectionTimeout);
      this.setupMessageHandler(sock, deviceConfig);

      // Armazena instância
      this.devices.set(deviceConfig.id, {
        sock,
        config: deviceConfig,
        connected: false,
        whatsappNumber: null,
        error: null,
      });
      

    } catch (error) {
      console.error(`❌ Error connecting ${deviceConfig.name}:`, error.message);
      reject(error);
    }
  });
  
}

  async reconnectAllDevices() {
    console.log('[INFO] 🔄 Iniciando processo de reconexão de todos os dispositivos...');
    const sessionDirs = (await fs.readdir(this.sessionsDir, { withFileTypes: true }))
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    if (sessionDirs.length === 0) {
      console.log('[INFO] ℹ️ Nenhuma sessão salva encontrada para reconectar.');
      return;
    }

    let successCount = 0, failureCount = 0;
    for (const whatsappNumber of sessionDirs) {
      try {
        await this.reconnectDevice(whatsappNumber);
        successCount++;
      } catch (error) {
        console.error(`[ERROR] [${whatsappNumber}] ❌ Falha crítica ao tentar reconectar: ${error.message}`);
        failureCount++;
      }
    }
    console.log(`[INFO] 📊 Resumo da reconexão: ${successCount} sucesso(s), ${failureCount} falha(s).`);
  }

  async reconnectDevice(whatsappNumber) {
    const deviceId = `device-${whatsappNumber}`;
     // --- LOGS DE DEPURACAO DE CAMINHOS ---
    // A sua observação está correta, provavelmente é um problema de caminho.
    // Estes logs vão mostrar-nos exatamente os caminhos que o Node.js está a usar.
    console.log(`\n[DEBUG] [${deviceId}] A verificar caminhos para a sessão...`);
    // 'this.sessionsDir' deve ser o caminho absoluto para a sua pasta de sessões.
    // Exemplo esperado: '/caminho/para/o/projeto/.sessions'
    console.log(`[DEBUG] [${deviceId}] Diretório base das sessões (this.sessionsDir): ${this.sessionsDir}`);

    const deviceSessionDir = path.join(this.sessionsDir, whatsappNumber);
    console.log(`[DEBUG] [${deviceId}] Caminho completo para a pasta da sessão a ser verificado: ${deviceSessionDir}`);
    // --- FIM DOS LOGS DE DEPURACAO ---

    console.log(`[INFO] [${deviceId}] 1. A iniciar tentativa de reconexão para o número ${whatsappNumber}`);

    console.log(`[INFO] [${deviceId}] 1. A iniciar tentativa de reconexão para o número ${whatsappNumber}`);

    // ETAPA 1: Verificar se o "passaporte" (creds.json) existe.
    // Se não existir, não há como reconectar sem QR Code.
    const configPath = path.join(deviceSessionDir, 'device_config.json');
    const credsPath = path.join(deviceSessionDir, 'creds.json');

    console.log(`[DEBUG] [${deviceId}] Caminho completo para a pasta da confi a ser verificado: ${configPath}`);

    if (!fsSync.existsSync(credsPath) || !fsSync.existsSync(configPath)) {
      console.error(`[ERROR] [${deviceId}] A sessão é inválida. Faltam 'creds.json' ou 'device_config.json'.`);
      throw new Error(`Sessão inválida para ${whatsappNumber}.`);
    }

    console.log(`[INFO] [${deviceId}] 2. Ficheiros de sessão encontrados.`);
    
    let deviceConfig;

    try {
      deviceConfig = JSON.parse(await fs.readFile(configPath, 'utf-8'));
      const { name } = deviceConfig;
      console.log(`[INFO] [${deviceId}] 3. A carregar configuração para o dispositivo: ${name}`);
      
      // ++ AQUI ESTÁ O PONTO-CHAVE ++
      // A função 'useMultiFileAuthState' lê todos os ficheiros da pasta da sessão,
      // incluindo o 'creds.json', e carrega-os para a variável 'state'.
      console.log(`[INFO] [${deviceId}] 4. A carregar estado de autenticação (creds.json)...`);
      const { state, saveCreds } = await useMultiFileAuthState(deviceSessionDir);

      
      // ++ AQUI ACONTECE A MÁGICA ++
      // Ao criar o socket, como a variável 'state' já contém as credenciais
      // do 'creds.json', o Baileys NÃO vai gerar um QR Code.
      // Em vez disso, ele vai tentar uma "retomada de sessão" (session resumption).
      const sock = makeWASocket({ auth: state });
      
      console.log(`[INFO] [${deviceId}] 5. Socket criado. A tentar restabelecer conexão...`);

      this.devices.set(deviceId, { sock, config: deviceConfig, connected: false });
      this._setupEventListeners(sock, deviceConfig, saveCreds);

    } catch (error) {
       console.error(`[ERROR] [${deviceId}] Ocorreu um erro crítico durante o processo de reconexão:`, error);
        throw error;
    }
  }
  async disconnectDevice(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) return;

    console.warn(`[WARN] [${deviceId}] Desconectando dispositivo ${device.config.name}...`);
    await device.sock.logout().catch(() => {});
    const sessionDir = path.join(this.sessionsDir, device.config.whatsappNumber);
    await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {});
    this.devices.delete(deviceId);
  }

  _setupEventListeners(sock, deviceConfig, saveCreds) {
    const deviceId = deviceConfig.id;
    

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect } = update;
      const device = this.devices.get(deviceId);
      
      if (!device) return;

      // Usamos um 'switch' para lidar de forma limpa com cada estado da conexão.
      switch (connection) {
        case 'connecting':
          console.log(`[INFO] [${deviceId}] ⏳ A conectar... (Visto no evento)`);
          break;

        case 'open':
          device.connected = true;
          console.log(`[INFO] [${deviceId}] ✅ Conexão estabelecida e confirmada pela aplicação!`);
          
          // Adicionamos a validação de número robusta aqui.
          const connectedNumberRaw = sock.user.id.split(':')[0];
          const expectedNumberRaw = deviceConfig.whatsappNumber;
          const connectedNumber = connectedNumberRaw.replace(/\D/g, '');
          const expectedNumber = expectedNumberRaw.replace(/\D/g, '');

          if (connectedNumber !== expectedNumber) {
            console.error(`[ERROR] [${deviceId}] ❌ NÚMERO INCORRETO! Conectado: ${connectedNumber}, Esperado: ${expectedNumber}. A desconectar...`);
            this.disconnectDevice(deviceId);
          } else {
            console.log(`[INFO] [${deviceId}] 👍 Verificação de número bem-sucedida.`);
          }
          break;

        case 'close':
          device.connected = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          
          // Lógica de fecho corrigida: verificamos explicitamente se foi um logout.
          if (statusCode === DisconnectReason.loggedOut) {
            console.error(`[ERROR] [${deviceId}] 🛑 Dispositivo desconectado pelo utilizador (logout). A remover sessão permanentemente.`);
            this.disconnectDevice(deviceId);
          } else {
            console.warn(`[WARN] [${deviceId}] 🔌 Conexão fechada por um motivo inesperado (Código: ${statusCode}). A biblioteca Baileys tentará reconectar-se automaticamente.`);
          }
          break;
      }
    });
    


    sock.ev.on('messages.upsert', ({ messages }) => {
      
      const msg = messages[0];
      console.log(`[INFO] [${deviceId}] 📩 ${msg.message?.conversation }`);
      if (msg.key.fromMe || !msg.message) return;
      this._handleIncomingMessage(sock, deviceConfig, msg);
    });
  }

  async _handleIncomingMessage(sock, deviceConfig, msg) {
    const from = msg.key.remoteJid;
    const userQuestion = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

    

    // Se quiser processar também as mensagens enviadas por você, remova o filtro abaixo:
    // if (msg.key.fromMe || !userQuestion) return;
    if (!userQuestion) return;

    console.log(`[INFO] [${deviceConfig.id}] 📥 Mensagem de ${from}: "${userQuestion}"`);
   

    try {
      // Chamada protegida à API de IA, enviando x-api-key no header
      const pythonResponse = await axios.post(
        `${process.env.IA_API_URL}/process_whatsapp_message`,
        {
          user_id: deviceConfig.user_id,
          message: userQuestion,
        },
        {
          headers: {
            'x-api-key': process.env.API_SECRET_KEY
          }
        }
      );

      const aiResponse = pythonResponse.data.response_gemini;
      
      console.log(`[INFO] [${deviceConfig.id}] 📤 Enviando resposta da IA para ${from}`);
      await sock.sendMessage(from, { text: aiResponse });

    } catch (error) {
      console.error(`[ERROR] [${deviceConfig.id}] ❌ Erro ao processar mensagem com IA: ${error.message}`);
      await sock.sendMessage(from, { text: 'Opa, tivemos um problema com a IA. Tente novamente.' });
    }
  }


  getDeviceStatus() {
    const status = [];
    for (const [id, device] of this.devices) {
      status.push({
        id,
        name: device.config.name,
        connected: device.connected,
        user_id: device.config.user_id,
        whatsappNumber: device.whatsappNumber,
        error: device.error || null
      });
    }
    
    // Adiciona estatísticas do histórico
    const chatStats = this.getChatHistoryStats();
    
    return {
      devices: status,
      chatHistory: chatStats
    };
  }

  async sendMessageToDevice(deviceId, to, message) {
    const device = this.devices.get(deviceId);
    if (device && device.connected) {
      try {
        await device.sock.sendMessage(to, { text: message });
        console.log(`📤 Mensagem enviada via ${device.config.name}`);
        return true;
      } catch (error) {
        console.error(`❌ Erro ao enviar mensagem via ${device.config.name}:`, error.message);
        return false;
      }
    } else {
      console.error(`❌ Dispositivo ${deviceId} não encontrado ou desconectado`);
      return false;
    }
  }

  // Função para obter informações detalhadas de um dispositivo
  getDeviceInfo(deviceId) {
    const device = this.devices.get(deviceId);
    if (device) {
      return {
        id: deviceId,
        name: device.config.name,
        connected: device.connected,
        user_id: device.config.user_id,
        whatsappNumber: device.whatsappNumber,
        authPath: device.config.authPath
      };
    }
    return null;
  }
}

module.exports = WhatsAppDeviceManager;
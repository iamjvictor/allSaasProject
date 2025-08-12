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

  async connectDevice(deviceConfig, forceNew = false) {
    return new Promise(async (resolve, reject) => {
      try {
        let qrGenerated = false;
        
        // Create a single directory for the device's session
        const deviceSessionDir = path.join(this.sessionsDir, deviceConfig.whatsappNumber);
        
        // Create device directory if it doesn't exist
        if (!fsSync.existsSync(deviceSessionDir)) {
          fsSync.mkdirSync(deviceSessionDir, { recursive: true });
        }
        
        // If forcing new connection, remove old session
        if (forceNew) {
          try {
            await fs.rm(deviceSessionDir, { recursive: true, force: true });
            await fs.mkdir(deviceSessionDir, { recursive: true });
            console.log(`🧹 Old session removed for ${deviceConfig.name}`);
          } catch (err) {
            console.warn(`⚠️ Could not remove old session (may not exist): ${err.message}`);
          }
        }

        const { state, saveCreds } = await useMultiFileAuthState(deviceSessionDir);

        const sock = makeWASocket({
          auth: state,
          printQRInTerminal: false,
          
        });

        // Timeout para garantir que não ficaremos esperando para sempre
        const connectionTimeout = setTimeout(() => {
          reject(new Error('Timeout: A geração do QR Code demorou demais.'));
        }, 20000); // 20 segundos de timeout

        sock.ev.on('connection.update', async (update) => {
          const { connection, lastDisconnect, qr } = update;
          const device = this.devices.get(deviceConfig.id);

          if (qr && !qrGenerated) {
              qrGenerated = true;
              clearTimeout(connectionTimeout);
              const qrImage = await QRCode.toDataURL(qr);
              
              require('qrcode-terminal').generate(qr, { small: true });
             
              resolve(qrImage);
          }

          if (connection === 'close') {
            if (device) device.connected = false;
            const reason = (lastDisconnect.error)?.output?.statusCode;
            const shouldReconnect = reason !== DisconnectReason.loggedOut;
            
            if (reason === DisconnectReason.loggedOut) {
              clearTimeout(connectionTimeout);
              reject(new Error('Dispositivo desconectado pelo usuário.'));
            } else if (shouldReconnect) {
              // Reconexão automática silenciosa
              this.connectDevice(deviceConfig, false).catch(err => {
                console.error(`[Reconexão Automática] Erro ao tentar reconectar ${deviceConfig.name}: ${err.message}`);
              });
            }
          }
          else if (connection === 'open') {
            if (device) device.connected = true;

            const connectedNumber = this.extractWhatsAppNumber(sock.user.id);
            const expectedNumber = deviceConfig.whatsappNumber;
            
            // ETAPA DE VERIFICAÇÃO: Compara o número conectado com o esperado do cadastro
            if (connectedNumber !== expectedNumber) {
              console.error(`❌ VERIFICAÇÃO FALHOU para ${deviceConfig.name}.`);
              console.error(`   - Número esperado (do cadastro): ${expectedNumber}`);
              console.error(`   - Número conectado (do QR Code):  ${connectedNumber}`);
              console.error('   - Desconectando a sessão para garantir a segurança.');
              
              await sock.logout();
              
              if (device) {
                device.connected = false;
                device.error = 'Número de WhatsApp incorreto escaneado.';
              }
              return;
            }

            // Se a verificação passar, continua normalmente
            const userId = deviceConfig.user_id;
            console.log(`✅ ${deviceConfig.name} conectado e verificado com sucesso!`);
            console.log(`📱 Número WhatsApp: ${connectedNumber}`);
            console.log(`🆔 User ID: ${userId}`);

            if (device) {
              device.config.user_id = userId;
              device.whatsappNumber = connectedNumber;
              delete device.error; // Limpa qualquer erro anterior
            }
            
            // Resolve a promessa indicando que conectou com sucesso
            clearTimeout(connectionTimeout);
            resolve('CONNECTED');
          }
        });

        sock.ev.on('creds.update', saveCreds);

        // Processamento de mensagens
        sock.ev.on('messages.upsert', async (m) => {
          const msg = m.messages[0];
          
          // Verifica diferentes tipos de mensagens
          const userQuestion = msg.message?.conversation || 
                              msg.message?.extendedTextMessage?.text;
          
          // Se não houver mensagem, retorna
          if (!userQuestion) {
            return;
          }

          // Verifica se é uma resposta (reply)
          const isReply = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
          const quotedMessage = isReply ? {
            text: msg.message.extendedTextMessage.contextInfo.quotedMessage.conversation,
            stanzaId: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant
          } : null;

          if (quotedMessage) {
            console.log('📝 Mensagem é uma resposta a:', quotedMessage.text);
          }

          const from = msg.key.remoteJid;
          const whatsappNumber = this.extractWhatsAppNumber(from);

          // Processa apenas mensagens recebidas
          if (msg.key.fromMe) {
            if (config.debug) {
              console.log(`📤 ${deviceConfig.name}: Mensagem enviada - ignorando`);
            }
            return;
          }

         
          
          console.log(`📥 ${deviceConfig.name} - Mensagem de ${from}: ${userQuestion}`);

          try {
            // Adiciona mensagem do usuário ao histórico
            this.addToChatHistory(whatsappNumber, 'user', userQuestion);
            
            // Obtém o histórico formatado para a API
            const chatHistory = this.formatChatHistory(whatsappNumber);
            
            // Usa o user_id específico do dispositivo conectado
            const currentUserId = deviceConfig.user_id; // Agora vem do cadastro/API
            
            console.log(`🤖 ${deviceConfig.name} - Consultando IA com user_id: ${currentUserId}...`);
            console.log(`📚 Histórico da conversa: ${chatHistory ? 'Sim' : 'Não'}`);
            
            const pythonResponse = await axios.post(config.pythonApiUrl, {
              user_id: currentUserId,
              message: userQuestion,
              chat_history: chatHistory
            });

            const aiResponse = pythonResponse.data.response_gemini;
            
            // Adiciona resposta da IA ao histórico
            this.addToChatHistory(whatsappNumber, 'assistant', aiResponse);
            
            console.log(`📤 ${deviceConfig.name} - Enviando resposta para ${from}`);
            await sock.sendMessage(from, { text: aiResponse });

          } catch (error) {
            console.error(`❌ ${deviceConfig.name} - Erro:`, error.message);
            await sock.sendMessage(from, { 
              text: 'Opa, deu um probleminha aqui pra conectar com a IA. Tenta de novo daqui a pouco!' 
            });
          }
        });

        // Armazena a instância do dispositivo
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

  async reconnectAllDevices(deviceManager) {
    try {
      const { data: users, error } = await supabase
        .from('users')
        .select('id, name, business_name, whatsapp_number')
        .not('whatsapp_number', 'is', null);
      
      if (error) {
        console.error('❌ Erro ao buscar usuários para reconexão:', error);
        return;
      }
      
      if (!users || users.length === 0) {
        console.log('ℹ️ Nenhum usuário encontrado para reconexão');
        return;
      }
      
      console.log(`📱 Verificando ${users.length} dispositivos...`);
      
      let connectedCount = 0;
      let expiredCount = 0;
      
      // Tenta reconectar cada dispositivo
      for (const user of users) {
        const normalizedNumber = user.whatsapp_number.replace(/\D/g, '');
        const deviceId = `device-${normalizedNumber}`;
        
        const deviceConfig = {
          id: deviceId,
          name: `Dispositivo ${user.business_name || user.name}`,
          authPath: `auth_info_baileys_${normalizedNumber}`,
          user_id: user.id,
          whatsappNumber: normalizedNumber,
        };
        
        try {
          // Tenta reconectar sem forçar novo QR (usa sessão existente)
          const result = await this.connectDevice(deviceConfig, false);
          
          // Verifica o resultado da conexão
          if (result === 'CONNECTED') {
            connectedCount++;
            console.log(`✅ ${deviceConfig.name}: Conectado`);
          } else if (result && result.startsWith('data:image')) {
            expiredCount++;
            console.log(`⚠️ ${deviceConfig.name}: Sessão expirada`);
          } else {
            expiredCount++;
            console.log(`⚠️ ${deviceConfig.name}: Status desconhecido`);
          }
          
          // Pequena pausa entre reconexões
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          expiredCount++;
          console.log(`❌ ${deviceConfig.name}: Erro na conexão`);
        }
      }
      
      console.log(`📊 Resumo: ${connectedCount} conectados, ${expiredCount} precisam de QR Code`);
      
    } catch (error) {
      console.error('❌ Erro durante reconexão automática:', error);
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
// src/controllers/authController.js
const supabase = require('../clients/supabase-client.js');
const GoogleCalendarService = require('../services/googleCalendarService');

const { google } = require('googleapis');
// 2. Buscar o userId real usando o resourceId
const googleRepository = require('../repository/googleRepository');

class IntegrationController {
    constructor() {
        // Cache para evitar processar o mesmo webhook múltiplas vezes
        this.processedWebhooks = new Map();
    }

    async handleGoogleWebhook(req, res) {
    // 1. Pega o 'resourceId' do cabeçalho que o Google envia
    const resourceId = req.headers['x-goog-resource-id'];
    const resourceState = req.headers['x-goog-resource-state'];
    const messageNumber = req.headers['x-goog-message-number'];
    const timestamp = new Date().toISOString();
    
    console.log('=== WEBHOOK GOOGLE CALENDAR ===');
    console.log('resourceId:', resourceId);
    console.log('resourceState:', resourceState);
    console.log('messageNumber:', messageNumber);
    console.log('Timestamp:', timestamp);
    
    if (!resourceId) {
        console.log('❌ resourceId não encontrado nos headers');
        return res.status(400).send();
    }

    // Verifica se já processamos este webhook recentemente (últimos 30 segundos)
    // Usa apenas resourceId para evitar processar o mesmo calendário múltiplas vezes
    // mas permite processar diferentes eventos (criação, exclusão, etc.)
    const webhookKey = resourceId;
    const lastProcessed = this.processedWebhooks.get(webhookKey);
    const now = Date.now();
    
    console.log(`🔍 Verificando cache: key=${webhookKey}, lastProcessed=${lastProcessed}, now=${now}`);
    
    // Só ignora se foi processado há menos de 5 segundos (evita duplicação rápida)
    if (lastProcessed && (now - lastProcessed) < 5000) { // 5 segundos
        console.log(`⚠️ Webhook já foi processado recentemente (${Math.round((now - lastProcessed) / 1000)}s atrás). Ignorando...`);
        return res.status(200).send();
    }
    
    // Marca como processado
    this.processedWebhooks.set(webhookKey, now);
    
    // Limpa cache antigo (mais de 5 minutos)
    for (const [key, time] of this.processedWebhooks.entries()) {
        if (now - time > 300000) { // 5 minutos
            this.processedWebhooks.delete(key);
        }
    }
    
    try {
        const integration = await googleRepository.getIntegrationByWatchId(resourceId);
        
        if (!integration || !integration.user_id) {
            console.log('❌ Integração não encontrada para resourceId:', resourceId);
            return res.status(200).send();
        }
        
        const userId = integration.user_id;
        console.log('✅ userId encontrado:', userId);

        // 3. Chama um serviço para sincronizar os eventos recentes
        console.log('🔄 Iniciando sincronização de eventos do Google...');
        await GoogleCalendarService.syncRecentEvents(userId);
        console.log('✅ Sincronização concluída');
        
    } catch (error) {
        console.error("❌ Erro ao sincronizar eventos do Google:", error);
    }

    console.log('=== FIM WEBHOOK ===');
    res.status(200).send();
    }
 }

module.exports = new IntegrationController();
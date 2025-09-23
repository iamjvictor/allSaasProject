// src/controllers/authController.js
const supabase = require('../clients/supabase-client.js');
const GoogleCalendarService = require('../services/googleCalendarService');

const { google } = require('googleapis');
// 2. Buscar o userId real usando o resourceId
const googleRepository = require('../repository/googleRepository');

class IntegrationController {
    async handleGoogleWebhook(req, res) {
    // 1. Pega o 'resourceId' do cabeçalho que o Google envia
    const resourceId = req.headers['x-goog-resource-id'];
    console.log('req.headers', req.headers);
    console.log('resourceId', resourceId);
    if (!resourceId) return res.status(400).send();
    try {
        
        const integration = await googleRepository.getIntegrationByWatchId(resourceId);
        
        if (!integration || !integration.user_id) {
            console.log('Integração não encontrada para resourceId:', resourceId);
            return res.status(200).send();
        }
        const userId = integration.user_id;
        console.log('userId encontrado:', userId);

        // 3. Chama um serviço para sincronizar os eventos recentes
        console.log('sincronizando eventos do Google');
        await GoogleCalendarService.syncRecentEvents(userId);
    } catch (error) {
        console.error("Erro ao sincronizar eventos do Google:", error);
    }

    res.status(200).send();
    }
 }

module.exports =  IntegrationController;
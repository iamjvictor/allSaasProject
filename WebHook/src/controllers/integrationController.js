// src/controllers/authController.js
const supabase = require('../clients/supabase-client.js');
const GoogleCalendarService = require('../services/googleCalendarService');

const { google } = require('googleapis');

class IntegrationController {
    async handleGoogleWebhook(req, res) {
    // 1. Pega o 'userId' do cabeçalho X-Goog-Channel-ID que o Google envia
    const userId = req.headers['x-goog-channel-id'];
    if (!userId) return res.status(400).send();

    try {
        // 2. Chama um serviço para sincronizar os eventos recentes
        await GoogleCalendarService.syncRecentEvents(userId);
    } catch (error) {
        console.error("Erro ao sincronizar eventos do Google:", error);
    }

    res.status(200).send();
    }
 }

module.exports =  IntegrationController;
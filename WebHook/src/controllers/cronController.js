const IntegrationRepository = require('../repository/integrationRepository');
const GoogleCalendarService = require('../services/googleCalendarService');

class CronController {
  /**
   * Orquestra a renovação de todas as vigilâncias do Google Calendar que estão expirando.
   * Este endpoint é protegido por uma chave secreta.
   */
  async renewExpiringWatches(req, res) {
    // 1. SEGURANÇA: Verifica a chave secreta enviada pelo Cron Job
    const cronSecret = req.headers['authorization']?.split(' ')[1];
    if (cronSecret !== process.env.CRON_JOB_SECRET) {
      return res.status(401).json({ message: "Não autorizado." });
    }

    console.log("CRON JOB: Iniciando a rotina de renovação de watches...");
    try {
      // 2. Encontra as integrações que precisam ser renovadas
      const integrationsToRenew = await IntegrationRepository.findExpiringWatches();

      if (integrationsToRenew.length === 0) {
        console.log("CRON JOB: Nenhuma vigilância para renovar hoje.");
        return res.status(200).json({ message: "Nenhuma vigilância para renovar." });
      }

      console.log(`CRON JOB: Encontradas ${integrationsToRenew.length} vigilâncias para renovar.`);

      console.log("vigilancia encontrada", integrationsToRenew);

      // 3. Renova cada uma delas em paralelo
      await Promise.all(
        integrationsToRenew.map(integration => 
          GoogleCalendarService.renewCalendarWatch(integration.user_id)
        )
      );

      res.status(200).json({ 
        message: "Rotina de renovação concluída com sucesso!",
        renewedCount: integrationsToRenew.length 
      });

    } catch (err) {
      console.error("CRON JOB: Erro durante a rotina de renovação:", err);
      res.status(500).json({ message: "Erro ao executar a rotina de renovação." });
    }
  }
}
module.exports = new CronController();
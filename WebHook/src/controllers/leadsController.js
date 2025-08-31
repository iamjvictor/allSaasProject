const LeadsRepository = require('../repository/leadsRepository');

class LeadsController {

  /**
   * Ponto de entrada para qualquer interação da IA.
   * Busca um lead pelo WhatsApp. Se não existir, cria um novo.
   */
  async findOrCreate(req, res) {
    try {
      const { user } = req; // O usuário vem do seu middleware de autenticação
      const { whatsappNumber } = req.body;

      if (!whatsappNumber) {
        return res.status(400).json({ message: "O número do WhatsApp é obrigatório." });
      }

      const lead = await LeadsRepository.findOrCreateByWhatsappNumber(user.id, whatsappNumber);
      
      res.status(200).json({ message: "Lead encontrado ou criado com sucesso.", data: lead });

    } catch (err) {
      console.error("Erro ao encontrar ou criar lead:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }

  /**
   * Atualiza o nome de um lead.
   */
  async updateName(req, res) {
    try {
      const { user } = req;
      // Note que o whatsappNumber virá como um parâmetro da URL, ex: /api/leads/1199998888/name
      const { whatsappNumber } = req.params;
      const { newName } = req.body;

      if (!newName) {
        return res.status(400).json({ message: "O novo nome é obrigatório." });
      }

      const updatedLead = await LeadsRepository.updateLeadName(user.id, whatsappNumber, newName);
      res.status(200).json({ message: "Nome do lead atualizado com sucesso!", data: updatedLead });

    } catch (err) {
      console.error("Erro ao atualizar nome do lead:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }

  /**
   * Atualiza o email de um lead.
   */
  async updateEmail(req, res) {
    try {
      const { user } = req;
      const { whatsappNumber } = req.params;
      const { newEmail } = req.body;

      if (!newEmail) {
        return res.status(400).json({ message: "O novo email é obrigatório." });
      }

      const updatedLead = await LeadsRepository.updateLeadEmail(user.id, whatsappNumber, newEmail);
      res.status(200).json({ message: "Email do lead atualizado com sucesso!", data: updatedLead });

    } catch (err) {
      console.error("Erro ao atualizar email do lead:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }

  /**
   * Atualiza o status de um lead.
   */
  async updateStatus(req, res) {
    try {
      const { user } = req;
      const { whatsappNumber } = req.params;
      const { newStatus } = req.body;
      
      const allowedStatus = ['frio', 'morno', 'quente', 'cliente'];
      if (!newStatus || !allowedStatus.includes(newStatus)) {
        return res.status(400).json({ message: "Status inválido." });
      }

      const updatedLead = await LeadsRepository.updateLeadStatus(user.id, whatsappNumber, newStatus);
      res.status(200).json({ message: "Status do lead atualizado com sucesso!", data: updatedLead });

    } catch (err) {
      console.error("Erro ao atualizar status do lead:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
}

module.exports = new LeadsController();
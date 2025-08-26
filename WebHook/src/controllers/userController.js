const supabase = require('../clients/supabase-client');
const UserRepository = require('../repository/usersRepository'); 

class UserController {
  // ... (seu método getProfile pode ficar aqui)

  async updateStatus(req, res) {
    try {
      // 1. O Chefe verifica as credenciais (o token)
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError) return res.status(401).json({ message: "Token inválido." });

      // 2. O Chefe lê os detalhes do pedido (o corpo da requisição)
      const { nextStep } = req.body;
      if (!nextStep) {
        return res.status(400).json({ message: "O próximo passo (nextStep) é obrigatório." });
      }

      // 3. O Chefe dá a ordem para o Cozinheiro Especialista (o Repositório)
      // Note que ele passa apenas os dados limpos e necessários: o ID do usuário e o novo status.
      const updatedProfile = await UserRepository.updateStatus(user.id, nextStep);
      
      // 4. O Chefe envia a resposta final para o Garçom (e para o cliente)
      res.status(200).json({ message: "Status atualizado!", profile: updatedProfile });

    } catch (err) {
      console.error("Erro ao atualizar status:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
  async getProfile(req, res) {
    try {
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });

      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError) return res.status(401).json({ message: "Token inválido." });

      const profile = await UserRepository.getProfile(user.id);
      res.status(200).json({ profile });

    } catch (err) {
      console.error("Erro ao buscar perfil:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
}

module.exports = UserController;
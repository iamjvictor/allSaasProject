const RoomRepository = require('../repository/roomRepository');
const supabase = require('../clients/supabase-client');

class RoomController {
  async createRooms(req, res) {
    try {
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError) return res.status(401).json({ message: "Token inválido." });

      const roomTypesData = req.body; // O array de quartos
      
      const newRooms = await RoomRepository.createMany(user.id, roomTypesData);

      res.status(201).json({ message: "Quartos cadastrados com sucesso!", data: newRooms });

    } catch (err) {
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }

  async getRooms(req, res) {
    try {
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError) return res.status(401).json({ message: "Token inválido." });

      const rooms = await RoomRepository.getRoomsByUserId(user.id);
      res.status(200).json({ data: rooms });

    } catch (err) {
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }

  async getRoomsForAI(req, res) {
    try {
      // O ID do hotel virá no corpo da requisição da IA
      const { userId } = req.body; 
      if (!userId) {
        return res.status(400).json({ message: "O ID do usuário (userId) é obrigatório." });
      }

      const rooms = await RoomRepository.getRoomsByUserId(userId);
      res.status(200).json({ data: rooms });

    } catch (err) {
      console.error("Erro ao buscar quartos para a IA:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }

  async updateRoom(req, res) {
    try {
      // 1. Autenticação (como você já tem)
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) return res.status(401).json({ message: "Token inválido." });

      // 2. Extração de Dados
      const { roomId } = req.params;
      const roomData = req.body;

      // 3. AUTORIZAÇÃO (A Validação de Propriedade)
      //    Verificamos se o quarto que o usuário quer editar realmente pertence a ele.
      const existingRoom = await RoomRepository.findByIdAndUserId(roomId, user.id);
      
      if (!existingRoom) {
        // Se não encontrarmos o quarto, significa ou que o ID do quarto está errado,
        // ou que o usuário está tentando editar um quarto que não é dele.
        // Em ambos os casos, negamos o acesso.
        return res.status(404).json({ message: "Quarto não encontrado ou acesso não permitido." });
      }

      // 4. Execução
      // Se chegamos até aqui, o usuário é o dono legítimo. Podemos prosseguir com a atualização.
      const updatedRoom = await RoomRepository.update(roomId, roomData);
      res.status(200).json({ message: "Quarto atualizado com sucesso!", data: updatedRoom });

    } catch (err) {
      console.error("Erro ao atualizar quarto:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
  async deleteRoom(req, res) {
    try {
      
      // O ID do quarto vem dos parâmetros da URL (ex: /api/rooms/123)
      const { roomId } = req.params;

      // 1. Autenticação (como você já tem)
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) return res.status(401).json({ message: "Não autorizado." });
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError || !user) return res.status(401).json({ message: "Token inválido." });

      

      const deletedRoom = await RoomRepository.deleteById(roomId, user.id);
      
      // Um status 204 (No Content) também é comum para deleções bem-sucedidas.
      res.status(200).json({ message: "Quarto deletado com sucesso!", data: deletedRoom });

    } catch (err) {
      console.error("Erro no controller ao deletar quarto:", err);
      // Se o repositório lançar o erro "Quarto não encontrado...", ele será enviado aqui.
      res.status(err.message.includes("não encontrado") ? 404 : 500).json({ message: err.message });
    }
  }
}

module.exports =  RoomController;
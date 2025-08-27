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

      const rooms = await RoomRepository.getByUserId(user.id);
      res.status(200).json({ data: rooms });

    } catch (err) {
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
}

module.exports =  RoomController;
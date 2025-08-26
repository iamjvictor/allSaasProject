// src/repositories/roomRepository.js
const supabase = require('../clients/supabase-client');

class RoomRepository {
  async createMany(userId, roomTypesData) {
    if (!roomTypesData || roomTypesData.length === 0) {
      return [];
    }

    // Mapeia os dados do frontend para o formato das colunas do banco
    const dataToInsert = roomTypesData.map(room => ({
      user_id: userId,
      name: room.name,
      description: room.description,
      capacity: room.capacity,
      privacy: room.privacy,
      bathroom: room.bathroom,
      daily_rate: room.dailyRate,
      beds: room.beds,
      amenities: room.amenities,
      // IMPORTANTE: Por enquanto, as fotos não serão salvas.
      // A lógica de upload de arquivos é separada e mais complexa.
      // Vamos focar em salvar os dados de texto primeiro.
      photos: [], 
    }));

    const { data, error } = await supabase
      .from('room_types')
      .insert(dataToInsert)
      .select();

    if (error) {
      console.error("Erro do Supabase ao inserir quartos:", error);
      throw error;
    }

    return data;
  }
}

module.exports = new RoomRepository();
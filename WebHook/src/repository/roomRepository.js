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
      daily_rate: room.daily_rate,
      beds: room.beds,
      amenities: room.amenities,
      // IMPORTANTE: Por enquanto, as fotos não serão salvas.
      // A lógica de upload de arquivos é separada e mais complexa.
      // Vamos focar em salvar os dados de texto primeiro.
      photos: room.photos || [], 
      total_quantity: room.total_quantity || 0
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
  
   async uploadImagesToBucket(userId, file, imageName) {
   

    // 2. Crie o caminho usando o nome limpo
    const filePath = `${userId}/${Date.now()}_${imageName}`;

    // 3. Faz o upload para o bucket correto
    const { error } = await supabase.storage
      .from('room_images') // Bucket específico para imagens de quartos
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) {
      console.error("ERRO DETALHADO DO SUPABASE STORAGE:", error);
      throw new Error(`Falha no upload da imagem para o Storage: ${error.message}`);
    }

    // 4. Retorna o caminho do arquivo para o controller
    return filePath;
  }
  async getRoomsByUserId(userId) {
    const { data, error } = await supabase
      .from('room_types')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error("Erro ao buscar quartos do usuário:", error);
      throw error;
    }

    return data;
  }
  async update(roomId, roomData) {
    const { id, user_id, created_at, ...dataToUpdate } = roomData; // Remove campos que não devem ser atualizados

    const { data, error } = await supabase
      .from('room_types')
      .update(dataToUpdate)
      .eq('id', roomId)
      .select()
      .single();

    if (error) {
      throw new Error(`Falha ao atualizar o quarto: ${error.message}`);
    }
    return data;
  }

  async findByIdAndUserId(roomId, userId) {
    const { data, error } = await supabase
      .from('room_types')
      .select('*')
      .eq('id', roomId)
      .eq('user_id', userId) // A condição de segurança chave
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    // Retorna 'data' (o quarto) se encontrado, ou 'null' se não.
    return data;
  }
  async deleteById(roomId, userId) {
    const { data, error } = await supabase
      .from('room_types')
      .delete()
      .match({ id: roomId, user_id: userId }) // CONDIÇÃO DUPLA: apaga somente se o ID do quarto E o ID do dono baterem.
      .select()
      .single();

    if (error) {
      console.error(`Erro ao deletar o quarto ${roomId}:`, error);
      throw new Error(`Falha ao deletar o quarto: ${error.message}`);
    }
    
    // Se 'data' for nulo, significa que nenhum quarto foi encontrado (e deletado)
    // com aquela combinação de roomId e userId.
    if (!data) {
        throw new Error("Quarto não encontrado ou acesso não permitido.");
    }

    return data;
  }
}

module.exports = new RoomRepository();
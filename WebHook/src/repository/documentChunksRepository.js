const supabase = require('../clients/supabase-client');



class DocumentChunksRepository {
 
  async createMany(chunks) {
    if (!chunks || chunks.length === 0) {
      console.log("Nenhum chunk fornecido para inserção. Operação ignorada.");
      return true; // Retorna sucesso pois não havia nada a ser feito.
    }
    
    console.log(`[Repository] Iniciando inserção em lote de ${chunks.length} chunks...`);

    // O método .insert() do Supabase aceita um array de objetos para
    // realizar a inserção em lote de forma otimizada.
    const { error } = await supabase
      .from('document_chunks')
      .insert(chunks);
      
    if (error) {
      // Se ocorrer um erro, ele será logado e lançado para a camada superior (controller) tratar.
      console.error("❌ Erro ao inserir chunks em lote no Supabase:", error);
      throw error;
    }
    
    console.log("✅ [Repository] Inserção em lote concluída com sucesso.");
    return true;
  }

  async findRelevantChunks(user_id, query_embedding, top_k = 3) {
    if (!query_embedding) {
      return [];
    }

    // --- CORREÇÃO AQUI: Chamamos a função RPC ---
    const { data, error } = await supabase.rpc('match_document_chunks', {
      p_user_id: user_id,
      p_query_embedding: query_embedding,
      p_match_count: top_k
    });

    if (error) {
      console.error("❌ Erro ao chamar a função RPC 'match_document_chunks':", error);
      throw error;
    }
    
    // Mapeia para retornar apenas o conteúdo dos chunks
    return data.map(chunk => chunk.content);
  }
 
}

// Exporta uma única instância da classe, seguindo o padrão Singleton.
module.exports = new DocumentChunksRepository();
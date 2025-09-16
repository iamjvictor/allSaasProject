const supabase = require('../clients/supabase-client');



class PdfRepository {
  async uploadPdfToBucket(userId, file, originalname) {

   

    // 3. Faz o upload do arquivo original para o Supabase Storage
    const filePath = `${userId}/${Date.now()}_${originalname}`;

    console.log(`Iniciando upload do arquivo para o Storage: ${filePath}`);
    console.log(`Tamanho do arquivo: ${file.size} e nome: ${originalname}`);

    const { error: uploadError } = await supabase.storage
      .from('documents') // Nome do nosso bucket
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) {
      throw new Error(`Falha no upload para o Storage: ${uploadError.message}`);
    }
    return filePath;
  }

  async saveManyPdfRecords(documentsToInsert) {
    const { data, error } = await supabase
      .from('documents')
      .insert(documentsToInsert) // Insere a lista diretamente
      .select();

    if (error) {
      console.error("Erro ao salvar registros de documentos:", error);
      throw error;
    }
    return data;
  }

  async getByUserId(userId) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.error("Erro ao buscar documentos do usuário:", error);
      throw error;
    }

    return data;
  }
  async findAllByUserId(userId) {
    const { data, error } = await supabase
      .from('documents')
      .select('file_name, content') // Pega apenas o nome e o conteúdo de texto
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Falha ao buscar documentos: ${error.message}`);
    }
    return data;
  }

  async getFilesFromBucket(userId) {
    const { data, error } = await supabase.storage
      .from('documents')
      .list(userId, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
      });

    if (error) {
      throw new Error(`Falha ao listar arquivos do bucket: ${error.message}`);
    }
    return data;
  }

  async getById(documentId) {
    console.log(`Buscando documento com ID: ${documentId}`);

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single(); // Adiciona .single() para retornar um objeto em vez de array

    if (error) {
      throw new Error(`Falha ao buscar documento: ${error.message}`);
    }
    return data;
  }

  async deleteDocumentById(documentId) {
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      throw new Error(`Falha ao deletar documento: ${error.message}`);
    }
  }

  async deleteFileFromBucket(filePath) {
    console.log(`Deletando arquivo do bucket: ${filePath}`);

    const { error } = await supabase.storage
      .from('documents')
      .remove([filePath]);

    if (error) {
      throw new Error(`Falha ao deletar arquivo do bucket: ${error.message}`);
    }
  }
}

module.exports = new PdfRepository();

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
}

module.exports = new PdfRepository();

const supabase = require('../clients/supabase-client');
const pdf = require('pdf-parse');
const PdfRepository = require('../repository/pdfRepository');
const roomRepository = require('../repository/roomRepository');




function sanitizeFilename(filename) {
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  const nameWithoutExtension = filename.slice(0, filename.lastIndexOf('.'));
  const sanitized = nameWithoutExtension
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
  return sanitized + extension;
}

class UploadController {    
  async uploadDocuments(req, res) {
       // 1. FAZEMOS A AUTENTICAÇÃO AQUI DENTRO
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) {
        return res.status(401).json({ message: "Acesso negado. Token não fornecido." });
      }
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError) {
        return res.status(401).json({ message: "Token inválido." });
      }

      // 2. AGORA, com o 'user' garantido, continuamos a lógica
      const files = req.files;
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "Nenhum arquivo enviado." });
      }

    try {
      // 2. Processamos os arquivos, montando um objeto COMPLETO para cada um.
      const documentsToSave = await Promise.all(
        files.map(async (file) => {
          if (file.mimetype !== 'application/pdf') {
            console.error(`O arquivo ${file.originalname} não é um PDF.`);
           
          }
          
          const pdfData = await pdf(file.buffer);
          const extractedText = pdfData.text;
          const originalName = sanitizeFilename(file.originalname);
          
          const filePath = await PdfRepository.uploadPdfToBucket(user.id, file, originalName);

          // O objeto já contém todas as informações necessárias, incluindo o user_id.
          return {
            user_id: user.id,
            file_name: originalName,
            storage_path: filePath,
            content: extractedText,
          };
        })
      );

      // 3. Passamos a lista COMPLETA para o repositório, que só precisa salvar.
      const savedDocuments = await PdfRepository.saveManyPdfRecords(documentsToSave);

      res.status(200).json({ 
        message: "Arquivos enviados e processados com sucesso!", 
        documents: savedDocuments 
      });

    } catch (err) {
      console.error("Erro no upload de documentos:", err);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }
  async uploadRoomPhotos(req, res) {
   // 1. FAZEMOS A AUTENTICAÇÃO AQUI DENTRO
      const jwt = req.headers.authorization?.split(' ')[1];
      if (!jwt) {
        return res.status(401).json({ message: "Acesso negado. Token não fornecido." });
      }
      
      const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
      if (authError) {
        return res.status(401).json({ message: "Token inválido." });
      }

      // 2. AGORA, com o 'user' garantido, continuamos a lógica
      const files = req.files;
      if (!files || files.length === 0) {
        return res.status(400).json({ message: "Nenhum arquivo enviado." });
      }
    try {
      // 1. Usamos Promise.all para fazer todos os uploads em paralelo
      const uploadPromises = files.map(file => {
        const imageName = sanitizeFilename(file.originalname);
        return roomRepository.uploadImagesToBucket(user.id, file.buffer, imageName);
      });

      // 'filePaths' será um array com os caminhos retornados, ex: ['id/123_foto1.jpg', 'id/456_foto2.png']
      const filePaths = await Promise.all(uploadPromises);

      // 2. Com os caminhos em mãos, pegamos as URLs públicas
      const urls = filePaths.map(path => {
        const { data } = supabase.storage.from('room_images').getPublicUrl(path);
        return data.publicUrl;
      });
      
      // 3. Retorna a lista de URLs para o frontend
      res.status(200).json({ message: "Upload bem-sucedido!", urls });
      return urls;

    } catch (err) {
      console.error("Erro no upload das fotos do quarto:", err);
      res.status(500).json({ message: "Erro interno do servidor ao fazer upload." });
    }
  }

  async getUploadedFiles(req, res) {
    const jwt = req.headers.authorization?.split(' ')[1];
    if (!jwt) {
      return res.status(401).json({ message: "Acesso negado. Token não fornecido." });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError) {
      return res.status(401).json({ message: "Token inválido." });
    }

    try {
      const files = await PdfRepository.getByUserId(user.id);
      res.status(200).json({ data: files });
    } catch (error) {
      console.error("Erro ao buscar arquivos do usuário:", error);
      res.status(500).json({ message: "Erro interno do servidor." });
    }
  }

}

module.exports =  UploadController;
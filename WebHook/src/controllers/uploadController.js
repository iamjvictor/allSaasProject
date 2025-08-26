const supabase = require('../clients/supabase-client');
const pdf = require('pdf-parse');
const PdfRepository = require('../repository/pdfRepository');




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
}

module.exports =  UploadController;
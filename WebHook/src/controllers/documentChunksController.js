const documentChunksRepository = require('../repository/documentChunksRepository');


class DocumentChunksController {
    async findRelevant(req, res) {
        try {
            const { user_id, query_embedding, top_k } = req.body;

            if (!user_id || !query_embedding) {
            return res.status(400).json({ message: "user_id e query_embedding são obrigatórios." });
            }

            const relevantChunks = await documentChunksRepository.findRelevantChunks(user_id, query_embedding, top_k);
            res.status(200).json({ data: relevantChunks });

        } catch (error) {
            console.error("Erro ao encontrar chunks relevantes:", error);
            res.status(500).json({ message: 'Erro interno do servidor ao buscar chunks.', details: error.message });
        }
    }
}
module.exports = DocumentChunksController;
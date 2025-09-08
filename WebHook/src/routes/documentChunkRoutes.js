const express = require('express');
const router = express.Router();
const DocumentChunksController = require('../controllers/documentChunksController');
const documentChunksController = new DocumentChunksController();
const apiAuthMiddleware = require('../middlewares/apiAuth');

// Rota POST para buscar chunks relevantes
// Use o middleware de autenticação, se for o caso
router.post('/find-relevant', apiAuthMiddleware, documentChunksController.findRelevant.bind(documentChunksController));

module.exports = router;
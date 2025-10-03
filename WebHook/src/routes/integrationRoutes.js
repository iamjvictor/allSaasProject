
const express = require('express');
const router = express.Router();
const GoogleRepository  = require('../repository/googleRepository');
const IntegrationController = require('../controllers/integrationController');



router.get('/google/callback', GoogleRepository.getGoogleTokens);

router.post('/google/webhook', (req, res) => IntegrationController.handleGoogleWebhook(req, res));



module.exports = router;
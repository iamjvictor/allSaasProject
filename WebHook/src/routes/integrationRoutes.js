
const express = require('express');
const router = express.Router();
const GoogleRepository  = require('../repository/googleRepository');
const IntegrationController = require('../controllers/integrationController');
const integrationController = new IntegrationController();


router.get('/google/callback', GoogleRepository.getGoogleTokens);

router.post('/google/webhook', integrationController.handleGoogleWebhook);



module.exports = router;
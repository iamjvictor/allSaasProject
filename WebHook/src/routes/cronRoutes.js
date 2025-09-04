const express = require('express');
const router = express.Router();
const CronController = require('../controllers/cronController');

// Endpoint que será chamado pelo serviço de Cron Job
router.post('/renew-google-watches', CronController.renewExpiringWatches);

module.exports = router;
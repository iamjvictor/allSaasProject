const express = require('express');
const router = express.Router();
const DeviceController = require('../controllers/deviceController');

// Instancie o controller apenas uma vez
const deviceController = new DeviceController();

// Use bind para garantir o contexto correto do this
router.post('/connect', deviceController.connectDeviceAndReturnQr.bind(deviceController));


module.exports = router;
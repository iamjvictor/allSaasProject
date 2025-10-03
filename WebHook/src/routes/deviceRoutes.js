const express = require('express');
const router = express.Router();

// Usar a instância singleton do controller
const deviceController = require('../controllers/deviceController');

// Use bind para garantir o contexto correto do this
router.post('/connect', deviceController.connectDeviceAndReturnQr.bind(deviceController));
router.post('/disconnect', deviceController.disconnectDevice.bind(deviceController));
router.get('/status/:deviceId', deviceController.getDeviceStatus.bind(deviceController));
router.post('/reconnect-all', deviceController.reconnectAllDevices.bind(deviceController));

module.exports = router;
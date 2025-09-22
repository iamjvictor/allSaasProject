const express = require('express');
const router = express.Router();
const DeviceController = require('../controllers/deviceController');

// Instancie o controller (já usa a instância singleton internamente)
const deviceController = new DeviceController();

// Use bind para garantir o contexto correto do this
router.post('/connect', deviceController.connectDeviceAndReturnQr.bind(deviceController));
router.post('/disconnect', deviceController.disconnectDevice.bind(deviceController));
router.get('/status/:deviceId', deviceController.getDeviceStatus.bind(deviceController));
router.post('/reconnect-all', deviceController.reconnectAllDevices.bind(deviceController));

module.exports = router;
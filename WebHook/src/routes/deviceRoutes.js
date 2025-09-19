const express = require('express');
const router = express.Router();
const DeviceController = require('../controllers/deviceController');

// Função para criar as rotas com o controller passado
const createDeviceRoutes = (deviceController) => {
  const router = express.Router();
  
  // Use bind para garantir o contexto correto do this
  router.post('/connect', deviceController.connectDeviceAndReturnQr.bind(deviceController));
  router.post('/disconnect', deviceController.disconnectDevice.bind(deviceController));
  router.get('/status/:deviceId', deviceController.getDeviceStatus.bind(deviceController));
  router.post('/reconnect-all', deviceController.reconnectAllDevices.bind(deviceController));
  
  return router;
};

// Instancie o controller apenas uma vez (para compatibilidade)
const deviceController = new DeviceController();

// Use bind para garantir o contexto correto do this
router.post('/connect', deviceController.connectDeviceAndReturnQr.bind(deviceController));
router.post('/disconnect', deviceController.disconnectDevice.bind(deviceController));
router.get('/status/:deviceId', deviceController.getDeviceStatus.bind(deviceController));
router.post('/reconnect-all', deviceController.reconnectAllDevices.bind(deviceController));

module.exports = { router, createDeviceRoutes };
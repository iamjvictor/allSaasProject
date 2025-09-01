const express = require('express');
const router = express.Router();
const RoomController = require('../controllers/roomController');

const roomController = new RoomController();

// Define o endpoint: POST /api/rooms
router.post('/', roomController.createRooms);

router.get('/getrooms', roomController.getRooms);

router.put('/:roomId', roomController.updateRoom);

router.delete('/:roomId', roomController.deleteRoom);

module.exports = router;
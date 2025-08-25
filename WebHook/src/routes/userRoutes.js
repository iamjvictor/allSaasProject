const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');

const userController = new UserController();

router.get('/profile', userController.getProfile);

// Nova rota para atualizar o status
router.post('/update-status', userController.updateStatus);

module.exports = router;
const express = require('express');
const router = express.Router();
const UserController = require('../controllers/userController');

const userController = new UserController();

router.get('/profile', userController.getProfile);


// Nova rota para atualizar o status
router.post('/update-status', userController.updateStatus);

router.put('/update-profile', userController.updateProfile);

module.exports = router;
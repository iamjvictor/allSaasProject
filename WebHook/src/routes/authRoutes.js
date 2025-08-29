const express = require('express');
const router = express.Router();
const AuthController = require('../controllers/authController');

// 2. Crie uma instância do seu controller
const authController = new AuthController();

// 3. Defina o endpoint POST e aponte para o método 'register' da instância
//    O Express passará 'req' e 'res' automaticamente para a sua função.
router.post('/register', authController.register);

router.get('/google/callback', authController.googleAuthCallback);

// Você pode adicionar outras rotas de autenticação aqui depois
// router.post('/login', authController.login);

module.exports = router;
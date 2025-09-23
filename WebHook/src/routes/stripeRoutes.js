// src/api/routes/stripe.routes.js

const express = require('express');
const router = express.Router();
const StripeController = require('../controllers/stripeController');
const apiAuthMiddleware = require('../middlewares/apiAuth');


// A rota que você vai configurar no painel da Stripe.
// É CRUCIAL usar 'express.raw({ type: 'application/json' })' aqui.
// Isso garante que o corpo da requisição não seja modificado pelo Express
// antes de chegar ao nosso controller, permitindo que a verificação da
// assinatura da Stripe funcione corretamente.
router.post(
  '/confirmpayment', 
  express.raw({ type: 'application/json' }), 
  StripeController.handleWebhook.bind(StripeController)
);

router.post(
  '/create-subscription', 
  express.json(), 
  StripeController.createSubscription
);

router.post(
  '/create-onboarding', 
  express.json(), 
  StripeController.createOnboarding
);

router.post(
  '/cancel-subscription', 
  express.json(), 
  StripeController.cancelSubscription
);

router.post(
  '/create-portal-session', // O URL que o seu frontend irá chamar
  express.json(), // Garante que só utilizadores autenticados podem aceder
  StripeController.createPortalSession         // A função do seu controller que será executada
);


router.get(
  '/balance', 
  express.json(),
  StripeController.getBalance
);

router.get(
  '/account-status/:userId', 
  express.json(),
  StripeController.checkAccountStatus
);

module.exports = router;
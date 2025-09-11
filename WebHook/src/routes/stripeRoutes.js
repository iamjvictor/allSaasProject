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
  '/create-onboarding', 
  express.json(), 
  StripeController.createOnboarding);




router.get(
  '/balance', 
  express.json(),
  StripeController.getBalance
);


module.exports = router;
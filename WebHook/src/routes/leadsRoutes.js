const express = require('express');
const router = express.Router();
const LeadsController = require('../controllers/leadsController');

const leadsController = new LeadsController();

router.get('/findORcreate', leadsController.findOrCreate);


// Nova rota para atualizar o status
router.put('/updateName', leadsController.updateName);

router.put('/updateEmail', leadsController.updateEmail);

router.put ('/updateStatus', leadsController.updateStatus);

module.exports = router;
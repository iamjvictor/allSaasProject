
const express = require('express');
const router = express.Router();
const GoogleRepository  = require('../repository/googleRepository');


router.get('/google/callback', GoogleRepository.getGoogleTokens);





module.exports = router;
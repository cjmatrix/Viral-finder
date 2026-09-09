const express = require('express');
const { analyzeVideo } = require('../controllers/clipController');

const router = express.Router();

router.post('/analyze-video', analyzeVideo);

module.exports = router;

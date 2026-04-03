const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');

router.get('/', stockController.getStock);
router.get('/:modelNo', stockController.getStockByModelNo);

module.exports = router;

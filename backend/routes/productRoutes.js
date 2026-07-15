const express = require('express');
const router = express.Router();
const multer = require('multer');
const productController = require('../controllers/productController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', productController.getProducts);
router.post('/', productController.createProduct);
router.post('/import', upload.single('file'), productController.importProducts);
router.put('/:id', productController.updateProduct);

module.exports = router;

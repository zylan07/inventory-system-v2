const express = require('express');
const router = express.Router();
const multer = require('multer');
const productController = require('../controllers/productController');
const { requireAdmin } = require('../middleware/authMiddleware');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/', productController.getProducts);
router.post('/', requireAdmin, productController.createProduct);
router.post('/import', requireAdmin, upload.single('file'), productController.importProducts);
router.put('/:id', requireAdmin, productController.updateProduct);

module.exports = router;

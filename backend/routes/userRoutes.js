const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { requireAdmin } = require('../middleware/authMiddleware');

router.get('/', requireAdmin, userController.getAllUsers);
router.post('/', requireAdmin, userController.createUser);

router.get('/purchase-recipients', requireAdmin, userController.getPurchaseRecipients);
router.post('/purchase-recipients', requireAdmin, userController.createPurchaseRecipient);
router.put('/purchase-recipients/:id', requireAdmin, userController.updatePurchaseRecipient);
router.delete('/purchase-recipients/:id', requireAdmin, userController.deletePurchaseRecipient);

router.put('/:id', requireAdmin, userController.updateUser);
router.delete('/:id', requireAdmin, userController.deleteUser);

module.exports = router;

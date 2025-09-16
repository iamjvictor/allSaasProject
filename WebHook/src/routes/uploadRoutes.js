const express = require('express');
const router = express.Router();
const multer = require('multer');
const UploadController = require('../controllers/uploadController');
const apiAuthMiddleware = require('../middlewares/apiAuth');

const uploadController = new UploadController();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Endpoint: POST /api/uploads/document
// O 'upload.array('pdfFile')' é o middleware que processa o arquivo
router.post('/document', upload.array('pdfFile', 3), uploadController.uploadDocuments);
router.post('/room_photos', upload.array('roomPhotos'), uploadController.uploadRoomPhotos);
router.post('/get-content', apiAuthMiddleware, uploadController.getDocumentsForAI);

router.get('/getdocuments', uploadController.getUploadedFiles);
router.get('/getfiles', uploadController.getFilesFromBucket);
router.delete('/document/:id', uploadController.deleteDocument);



module.exports = router;
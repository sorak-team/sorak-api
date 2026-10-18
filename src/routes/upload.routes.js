import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { storageService } from '../services/storage.service.js';
import { BadRequest } from '../utils/http-error.js';

const router = Router();

// Configure Multer with MemoryStorage (max 2MB per upload specs)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new BadRequest('Định dạng tệp không được hỗ trợ. Vui lòng tải lên ảnh JPG, PNG hoặc WebP.'),
      );
    }
  },
});

/**
 * POST /api/upload/avatar
 * Upload and optimize profile avatar for teachers or students
 */
router.post('/avatar', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new BadRequest('Vui lòng chọn tệp ảnh để tải lên');
    }

    // Process and optimize image with Sharp (256x256 WebP, 85% quality)
    const optimizedBuffer = await storageService.processAvatar(req.file.buffer);

    // Persist via StorageService adapter
    const filename = `avatar_${uuidv4()}.webp`;
    const result = await storageService.upload(filename, optimizedBuffer, 'image/webp');

    res.success(
      {
        url: result.url,
        relativeUrl: result.relativeUrl,
        size: result.size,
      },
      'Tải ảnh lên thành công',
      201,
    );
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/upload/pickup
 * Upload pickup authorization photo or parent verification image to MinIO S3
 */
router.post('/pickup', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new BadRequest('Vui lòng chọn tệp ảnh để tải lên');
    }

    const ext = req.file.mimetype.split('/')[1] || 'webp';
    const filename = `pickup_${uuidv4()}.${ext}`;
    const result = await storageService.upload(filename, req.file.buffer, req.file.mimetype);

    res.success(
      {
        url: result.url,
        relativeUrl: result.relativeUrl,
        size: result.size,
      },
      'Tải ảnh đón trẻ lên thành công',
      201,
    );
  } catch (err) {
    next(err);
  }
});

export default router;

import multer from 'multer';

// Use memory storage to handle files as buffers
const storage = multer.memoryStorage();

// File filter to ensure only images are uploaded
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

// Configure multer
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// Specific middleware for product images (max 5)
export const uploadProductImages = upload.array('images', 5);

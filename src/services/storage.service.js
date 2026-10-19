import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import * as Minio from 'minio';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.join(__dirname, '../../public/uploads');

/**
 * StorageService implementing the Gang of Four (GoF) Adapter Pattern
 * as specified in Section 2.3.1 of the Technical Specification:
 * "The service wraps MinIO's S3 object storage APIs and Sharp's image processing pipeline
 * into uniform methods: upload(key, buffer, mimetype) and deleteObject(key).
 * This shields the core application logic from vendor-specific SDK details."
 */
export class StorageService {
  constructor() {
    this.uploadsDir = path.join(UPLOADS_ROOT, 'avatars');
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }

    this.minioClient = null;
    this.bucketName = env.minio?.bucket || 'sorak-media';
    this.bucketInitialized = false;

    if (env.minio?.endpoint && env.minio?.accessKey && env.minio?.secretKey) {
      try {
        this.minioClient = new Minio.Client({
          endPoint: env.minio.endpoint,
          port: env.minio.port,
          useSSL: env.minio.useSSL,
          accessKey: env.minio.accessKey,
          secretKey: env.minio.secretKey,
        });
        logger.info(
          `[StorageService] MinIO S3 adapter initialized for endpoint: ${env.minio.endpoint}:${env.minio.port}`,
        );
      } catch (err) {
        logger.warn(
          `[StorageService] Failed to initialize MinIO client: ${err.message}. Local storage fallback enabled.`,
        );
      }
    } else {
      logger.info(
        '[StorageService] MinIO not fully configured in env. Operating in local filesystem storage mode.',
      );
    }
  }

  /**
   * Ensure bucket exists and has public read access for media
   */
  async ensureBucket() {
    if (!this.minioClient || this.bucketInitialized) return;
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        logger.info(`[StorageService] Created MinIO bucket: ${this.bucketName}`);

        // Set public read policy for assets
        const policy = {
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [`arn:aws:s3:::${this.bucketName}/*`],
            },
          ],
        };
        await this.minioClient.setBucketPolicy(this.bucketName, JSON.stringify(policy));
      }
      this.bucketInitialized = true;
    } catch (err) {
      logger.warn(`[StorageService] ensureBucket failed: ${err.message}`);
    }
  }

  /**
   * Optimize and resize avatar image with Sharp
   * - Max 256x256 square crop
   * - Convert to WebP format for fast web delivery
   * - Strips EXIF metadata for privacy
   */
  async processAvatar(buffer) {
    return sharp(buffer)
      .resize(256, 256, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 85 })
      .toBuffer();
  }

  /**
   * Upload file buffer to persistent storage adapter (MinIO S3 or Local fallback)
   * @param {string} filename - Target file name or key
   * @param {Buffer} buffer - Binary file buffer
   * @param {string} mimetype - MIME type (e.g. 'image/webp')
   * @returns {Promise<{ url: string, key: string, size: number, provider: 'minio' | 'local' }>}
   */
  async upload(filename, buffer, mimetype = 'image/webp') {
    const safeName = filename || `avatar_${uuidv4()}.webp`;
    const folder = safeName.startsWith('pickup_') ? 'pickup' : 'avatars';
    const objectKey = `${folder}/${safeName}`;

    // 1. If MinIO is configured, upload to MinIO S3 Object Storage
    if (this.minioClient) {
      try {
        await this.ensureBucket();
        await this.minioClient.putObject(this.bucketName, objectKey, buffer, buffer.length, {
          'Content-Type': mimetype,
        });

        // Compute accessible URL
        let publicUrl;
        if (env.minio.publicUrl) {
          publicUrl = `${env.minio.publicUrl.replace(/\/$/, '')}/${objectKey}`;
        } else {
          const protocol = env.minio.useSSL ? 'https' : 'http';
          publicUrl = `${protocol}://${env.minio.endpoint}:${env.minio.port}/${this.bucketName}/${objectKey}`;
        }

        logger.info(`[StorageService] Uploaded to MinIO S3: ${objectKey} (${buffer.length} bytes)`);
        return {
          key: objectKey,
          url: publicUrl,
          relativeUrl: `/${this.bucketName}/${objectKey}`,
          size: buffer.length,
          mimetype,
          provider: 'minio',
        };
      } catch (err) {
        logger.warn(
          `[StorageService] MinIO upload failed: ${err.message}. Falling back to local filesystem storage.`,
        );
      }
    }

    // 2. Fallback: Local filesystem storage
    const targetPath = path.join(this.uploadsDir, safeName);
    await fs.promises.writeFile(targetPath, buffer);

    const relativeUrl = `/uploads/avatars/${safeName}`;
    const baseUrl = env.serverUrl || `http://localhost:${env.port || 3000}`;
    const fullUrl = `${baseUrl}${relativeUrl}`;

    logger.info(`[StorageService] Uploaded to local disk: ${safeName} (${buffer.length} bytes)`);

    return {
      key: objectKey,
      url: fullUrl,
      relativeUrl,
      size: buffer.length,
      mimetype,
      provider: 'local',
    };
  }

  /**
   * Delete object from storage adapter
   * @param {string} key - File key or path
   */
  async deleteObject(key) {
    if (!key) return;
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;

    // Delete from MinIO if active
    if (this.minioClient) {
      try {
        await this.minioClient.removeObject(this.bucketName, cleanKey);
        logger.info(`[StorageService] Deleted from MinIO: ${cleanKey}`);
        return;
      } catch (err) {
        logger.warn(`[StorageService] Failed to delete from MinIO: ${err.message}`);
      }
    }

    // Delete from local disk
    try {
      const filePath = path.join(UPLOADS_ROOT, cleanKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        logger.info(`[StorageService] Deleted from local disk: ${cleanKey}`);
      }
    } catch (err) {
      logger.warn(`[StorageService] Failed to delete local file ${cleanKey}: ${err.message}`);
    }
  }
}

export const storageService = new StorageService();
export default storageService;

import type { Request, Response, NextFunction } from 'express';
import catchAsync from '../../utils/catchAsync';
import { writeFile, createReadStream, exists } from 'fs';
import { promisify } from 'util';
import { join } from 'path';
import ApiResponse from '../../utils/ApiResponse';
import AppError from '../../utils/appError';
import { db, user } from '../../db';
import { eq } from 'drizzle-orm';

export const uploadProfilePicture = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const bytes = req.body;

    if (!bytes || bytes.length === 0)
      throw new AppError('No image found in the upload', 400);

    if (bytes.length > 5 * 1024 * 1024)
      throw new AppError('Image too large', 413);

    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    const isPng =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;

    if (!isJpeg && !isPng) throw new AppError('Unsupported image format', 400);

    const fileName = `${req.user?.id}_${Date.now()}.${isJpeg ? 'jpg' : 'png'}`

    await promisify(writeFile)(
      join(__dirname, `../../images/profilePics/${fileName}`),
      bytes,
    );

    await db
      .update(user)
      .set({
        profilePic: `/${fileName}`,
      })
      .where(eq(user.id, req.user?.id ?? ''));

    new ApiResponse(201, 'Profile picture changed successfully').send(res);
  },
);


/**
 * Endpoint to delete the user's profile picture, it will be set to the default one. The image file will not be deleted from the server though.
 */
export const deleteProfilePicture = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if(req.user){
      await db
        .update(user)
        .set({ profilePic: 'defaultProfilePic.png' })
        .where(eq(user.id, req.user.id));
      new ApiResponse(203, 'Profile picture deleted successfully').send(res);
    }
  }
);


/**
 * Downloads the QR code to join the camp, with a download stream.
 */
export const downloadCampQrCode = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const filePath = join(__dirname, `../../images/qrCodes/${req.params?.id}.png`);

    if (!(await promisify(exists)(filePath)))
      throw new AppError('A QrCode for this camp was not found', 404);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${req.params?.id}.png"`,
    );
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition','attachment; filename="joinQRCode.png"')

    const fileStream = createReadStream(filePath);
    fileStream.pipe(res);
  },
);

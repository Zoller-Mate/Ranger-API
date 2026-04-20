import AppError from './appError';
import { sign } from 'jsonwebtoken';
/**
 * Creates a JWT and signs it.
 * @param id The userId that should be put into the token
 * @returns The signed token
 */
const signToken = (id: string): string => {
  if (!process.env.JWT_SECRET) {
    throw new AppError('JWT_SECRET is not defined', 500);
  }
  const expiresInDays = process.env.JWT_EXPIRES_IN;
  return sign({ id }, process.env.JWT_SECRET, {
    expiresIn: `${expiresInDays}d`,
  } as any);
};

export default signToken;
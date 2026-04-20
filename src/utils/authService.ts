import { verify } from 'jsonwebtoken';
import { db } from '../db';
import { user } from '../db/schema';
import { eq } from 'drizzle-orm';

interface JWTPayload {
  id: string;
  iat?: number;
  exp?: number;
}

interface AuthResult {
  success: boolean;
  user?: {
    id: string;
    name: string;
    email: string;
    profilePic: string | null;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Shared authentication service for both REST API and WebSocket
 * Validates JWT token and checks user status
 */
export async function validateToken(token: string): Promise<AuthResult> {
  try {
    // 1) Verify JWT token
    if (!process.env.JWT_SECRET) {
      return {
        success: false,
        error: {
          code: 'CONFIG_ERROR',
          message: 'JWT_SECRET not configured',
        },
      };
    }

    let decoded: JWTPayload;
    try {
      decoded = verify(token, process.env.JWT_SECRET) as JWTPayload;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'JsonWebTokenError') {
          return {
            success: false,
            error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
          };
        }
        if (error.name === 'TokenExpiredError') {
          return {
            success: false,
            error: { code: 'TOKEN_EXPIRED', message: 'Token expired' },
          };
        }
      }
      throw error;
    }

    if (!decoded || !decoded.id) {
      return {
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid token payload' },
      };
    }

    // 2) Check if user still exists
    const [currentUser] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        profilePic: user.profilePic,
        passwordResetAt: user.passwordResetAt,
      })
      .from(user)
      .where(eq(user.id, decoded.id))
      .limit(1);

    if (!currentUser) {
      return {
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User no longer exists',
        },
      };
    }

    // 3) Check if user changed password after token was issued
    if (currentUser.passwordResetAt && decoded.iat) {
      const passwordChangedTimestamp = Math.floor(
        new Date(currentUser.passwordResetAt).getTime() / 1000,
      );
      if (passwordChangedTimestamp > decoded.iat) {
        return {
          success: false,
          error: {
            code: 'PASSWORD_CHANGED',
            message: 'User recently changed password',
          },
        };
      }
    }

    // Success!
    return {
      success: true,
      user: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        profilePic: currentUser.profilePic,
      },
    };
  } catch (error) {
    console.error('Auth validation error:', error);
    return {
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed',
      },
    };
  }
}

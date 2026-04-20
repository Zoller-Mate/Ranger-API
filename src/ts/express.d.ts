import * as express from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        name: string;
        email: string;
        profilePic: string | null;
        campRole?: string;
      };
      links?: {
        prev: string;
        next: string;
      };
      createdData?: any;
    }
  }
}

export {};

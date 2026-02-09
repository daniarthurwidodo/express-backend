import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthRepository } from '../repositories/auth.repository';

const authRepository = new AuthRepository();
const authService = new AuthService(authRepository);

export interface AuthRequest extends Request {
  user?: any;
  session?: any;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: No token provided' });
      return;
    }

    const token = authHeader.substring(7);
    const sessionData = await authService.getSession(token);

    if (!sessionData || !sessionData.session) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      return;
    }

    req.user = sessionData.user;
    req.session = sessionData.session;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized: Authentication failed' });
  }
};

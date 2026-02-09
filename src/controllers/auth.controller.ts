import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ISignUpRequest, ISignInRequest } from '../models/auth.types';
import { AuthRequest } from '../middleware/auth.middleware';

export class AuthController {
  constructor(private authService: AuthService) {}

  async signUp(req: Request, res: Response): Promise<void> {
    try {
      const signUpData: ISignUpRequest = req.body;
      const result = await this.authService.signUp(signUpData);
      res.status(201).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign up failed';
      res.status(400).json({ error: message });
    }
  }

  async signIn(req: Request, res: Response): Promise<void> {
    try {
      const signInData: ISignInRequest = req.body;
      const result = await this.authService.signIn(signInData);
      res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      res.status(401).json({ error: message });
    }
  }

  async getProfile(req: AuthRequest, res: Response): Promise<void> {
    try {
      res.status(200).json({ user: req.user, session: req.session });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get profile';
      res.status(400).json({ error: message });
    }
  }

  async signOut(req: AuthRequest, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.substring(7) || '';
      await this.authService.signOut(token);
      res.status(200).json({ message: 'Signed out successfully' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign out failed';
      res.status(400).json({ error: message });
    }
  }
}

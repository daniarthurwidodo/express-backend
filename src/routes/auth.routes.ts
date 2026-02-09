import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';
import { AuthRepository } from '../repositories/auth.repository';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

const authRepository = new AuthRepository();
const authService = new AuthService(authRepository);
const authController = new AuthController(authService);

router.post('/signup', (req, res) => authController.signUp(req, res));
router.post('/signin', (req, res) => authController.signIn(req, res));
router.get('/profile', requireAuth, (req, res) => authController.getProfile(req, res));
router.post('/signout', requireAuth, (req, res) => authController.signOut(req, res));

export default router;

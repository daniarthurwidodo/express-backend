import { AuthRepository } from '../repositories/auth.repository';
import { ISignUpRequest, ISignInRequest, IAuthResponse } from '../models/auth.types';

export class AuthService {
  constructor(private authRepository: AuthRepository) {}

  async signUp(data: ISignUpRequest): Promise<IAuthResponse> {
    const { email, password, name } = data;

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    const result = await this.authRepository.createUser(email, password, name);
    
    return this.formatAuthResponse(result);
  }

  async signIn(data: ISignInRequest): Promise<IAuthResponse> {
    const { email, password } = data;

    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    const result = await this.authRepository.authenticateUser(email, password);
    
    return this.formatAuthResponse(result);
  }

  async getSession(sessionToken: string): Promise<any> {
    if (!sessionToken) {
      throw new Error('Session token is required');
    }

    return await this.authRepository.getUserBySession(sessionToken);
  }

  async signOut(sessionToken: string): Promise<void> {
    if (!sessionToken) {
      throw new Error('Session token is required');
    }

    await this.authRepository.signOut(sessionToken);
  }

  private formatAuthResponse(result: any): IAuthResponse {
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      session: {
        token: result.session.token,
        expiresAt: new Date(result.session.expiresAt),
      },
    };
  }
}

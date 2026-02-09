import { auth } from '../config/auth.config';
import { IUser } from '../models/auth.types';

export class AuthRepository {
  async createUser(email: string, password: string, name?: string): Promise<any> {
    return await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });
  }

  async authenticateUser(email: string, password: string): Promise<any> {
    return await auth.api.signInEmail({
      body: {
        email,
        password,
      },
    });
  }

  async getUserBySession(sessionToken: string): Promise<any> {
    return await auth.api.getSession({
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });
  }

  async signOut(sessionToken: string): Promise<void> {
    await auth.api.signOut({
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });
  }
}

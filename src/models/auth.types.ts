export interface ISignUpRequest {
  email: string;
  password: string;
  name?: string;
}

export interface ISignInRequest {
  email: string;
  password: string;
}

export interface IAuthResponse {
  user: {
    id: string;
    email: string;
    name?: string;
  };
  session: {
    token: string;
    expiresAt: Date;
  };
}

export interface IUser {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

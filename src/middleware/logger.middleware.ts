import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger.config';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logData = {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };

    if (res.statusCode >= 400) {
      logger.error(logData, 'HTTP Request Error');
    } else {
      logger.info(logData, 'HTTP Request');
    }
  });

  next();
};

export default requestLogger;

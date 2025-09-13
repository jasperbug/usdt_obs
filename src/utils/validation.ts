import Joi from 'joi';
import { DonationMethod } from '../types/donation';

export const createDonationSchema = Joi.object({
  amount: Joi.number().positive().min(1).max(10000).required(),
  nickname: Joi.string().min(1).max(100).trim().optional(),
  message: Joi.string().max(500).trim().optional()
});

export const getDonationSchema = Joi.object({
  id: Joi.string().uuid().required()
});


export function validateRequest<T>(schema: Joi.ObjectSchema<T>, data: any): { error?: string; value?: T } {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    const errorMessage = error.details.map(detail => detail.message).join(', ');
    return { error: errorMessage };
  }

  return { value };
}
export enum DonationMethod {
  BSC = 'BEP20'
}

export enum DonationStatus {
  PENDING = 'PENDING',
  PENDING_SHOWN = 'PENDING_SHOWN',
  CONFIRMED = 'CONFIRMED',
  EXPIRED = 'EXPIRED'
}

export interface Donation {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  method: DonationMethod;
  status: DonationStatus;
  baseAmount: number;
  tail: number;
  payAmount: number;
  nickname?: string | undefined;
  message?: string | undefined;
  txHash?: string;
  firstBlock?: number;
  confirmedAt?: Date | undefined;
  expiresAt: Date;
}

export interface CreateDonationRequest {
  amount: number;
  nickname?: string | undefined;
  message?: string | undefined;
}

export interface DonationResponse {
  id: string;
  payAmount: number;
  address: string;
  expiresAt: Date;
}


export interface WebSocketDonationEvent {
  id: string;
  nickname: string;
  amount: number;
  message: string;
  method: string;
}
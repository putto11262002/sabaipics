import type { CreditLedgerSource } from '@/db';

export interface CreditDebitMessage {
  type: 'debit';
  photographerId: string;
  amount: number;
  operationType: string;
  operationId: string;
  source: CreditLedgerSource;
}

export interface CreditRefundMessage {
  type: 'refund';
  photographerId: string;
  amount: number;
  source: 'refund';
  reason: string;
}

export type CreditQueueMessage = CreditDebitMessage | CreditRefundMessage;

export type Session = { token: string; user: { id: string; phone: string } };
export type Loan = {
  id: string;
  friendName: string;
  amountPaise: number;
  dueDate: string;
  repaidAt: string | null;
  createdAt: string;
  hasReceipt: boolean;
  overdue: boolean;
};
export type Summary = {
  totalLentPaise: number;
  totalRepaidPaise: number;
  outstandingPaise: number;
  overduePaise: number;
  entryCount: number;
  currency: string;
  today: string;
  timezone: string;
};
export type Receipt = { uri: string; name: string; type: string };

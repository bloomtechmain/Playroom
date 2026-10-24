export type PayMethod = "cash" | "card" | "transfer" | "digital" | "wallet";

export type Permission = string;

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  locked?: boolean;
}

export interface User {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string;
  roleId: string;
  active: boolean;
  /** only ever sent *to* the server (new user / temporary password); never returned by it */
  password?: string;
  mustChangePassword?: boolean;
  lastLogin?: string;
  createdAt: string;
}

export interface Zone {
  id: string;
  name: string;
  kind: "play" | "party" | "cowork";
  capacity: number;
  nearFullPct: number;
  openTime: string; // "09:00"
  closeTime: string;
  basePrice: number;
  minAge?: number;
  maxAge?: number;
  rules: string;
  active: boolean;
  color: string;
}

export interface RatePlan {
  id: string;
  zoneId: string;
  name: string;
  unit: "hour" | "half" | "custom";
  minutes: number;
  price: number; // per child (play) / per person (cowork)
  graceMinutes: number;
  overtimeBlock: number; // minutes
  overtimePrice: number; // per block, per child
  active: boolean;
}

export interface PriceRule {
  id: string;
  name: string;
  kind: "weekday" | "weekend" | "peak" | "offpeak" | "holiday" | "event";
  days: number[]; // 0=Sun
  start: string;
  end: string;
  date?: string; // for event rules
  adjust: "percent" | "fixed";
  value: number; // +surcharge / -discount; fixed is per visitor
  zoneIds: string[];
  active: boolean;
}

export interface Promotion {
  id: string;
  code: string;
  name: string;
  type: "percent" | "fixed" | "package" | "bonus_time";
  value: number; // percent / fixed amount / package price / bonus minutes
  packageKids?: number;
  validFrom: string;
  validTo: string;
  usageCap: number; // 0 = unlimited
  used: number;
  auto: boolean;
  active: boolean;
  zoneIds: string[];
  targeting: {
    minSpend?: number;
    minVisitors?: number;
    childMinAge?: number;
    childMaxAge?: number;
    membersOnly?: boolean;
    minPriorVisits?: number;
  };
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  member: boolean;
  points: number;
  wallet: number;
  notes: string;
  /** no WhatsApp promotions or birthday wishes */
  whatsappOptOut?: boolean;
  createdAt: string;
}

export interface Child {
  id: string;
  guardianId: string;
  name: string;
  dob: string;
  gender: "girl" | "boy" | "other";
  allergies: string;
}

export type TicketStatus = "active" | "completed" | "cancelled" | "expired" | "refunded";

export interface Ticket {
  id: string;
  code: string;
  customerId: string;
  childIds: string[];
  visitors: number; // kids (play) or people (cowork)
  adults: number;
  zoneId: string;
  /** the rate plan the stay was charged with — chosen at check-out from the time actually spent */
  ratePlanId?: string;
  /** minutes stayed (filled in at check-out) */
  minutes: number;
  /** tickets checked in together (play + co-work) share a visit id and leave together */
  visitId?: string;
  checkIn: string;
  checkOut?: string;
  status: TicketStatus;
  base: number;
  ruleAdjust: number;
  ruleNames: string[];
  promoId?: string;
  discount: number;
  loyaltyUsed: number;
  overtimeFee: number;
  total: number;
  paid: number;
  createdBy: string;
  reprints: number;
  bookingId?: string;
}

export type TxType = "play" | "cowork" | "overtime" | "deposit" | "party" | "pos" | "topup" | "refund";

export interface Transaction {
  id: string;
  at: string;
  type: TxType;
  method: PayMethod | "online";
  amount: number; // refunds negative
  ref: string;
  refLabel: string;
  customerId?: string;
  shiftId?: string;
  userId: string;
  discount: number;
  revenueType?: TxType; // for refunds: which revenue stream is reversed
}

export interface Product {
  id: string;
  name: string;
  category: string;
  sku: string;
  price: number;
  cost: number;
  stock: number;
  reorderAt: number;
  active: boolean;
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
  cost: number;
}

export interface Sale {
  id: string;
  no: string;
  at: string;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  method: PayMethod;
  tendered: number;
  userId: string;
  shiftId?: string;
  customerId?: string;
  refunded?: number;
}

export interface PartyPackage {
  id: string;
  name: string;
  roomZoneId: string;
  guestLimit: number; // kids included
  durationMin: number;
  priceRoomOnly: number;
  priceFullVenue: number;
  extraGuestPrice: number;
  depositPct: number;
  includes: string[];
  active: boolean;
}

export interface Addon {
  id: string;
  name: string;
  kind: "addon" | "food" | "decor";
  price: number;
  perHead: boolean;
  active: boolean;
}

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

export interface Booking {
  id: string;
  ref: string;
  kind: "play" | "party" | "cowork";
  mode?: "room" | "full"; // party: room only, or full venue (locks play area)
  customerId: string;
  date: string; // yyyy-MM-dd
  start: string; // HH:mm
  end: string;
  zoneId: string;
  packageId?: string;
  guests: number;
  kids: number;
  addonIds: string[];
  theme: string;
  notes: string;
  total: number;
  adjustment?: number; // manual +/- agreed with the customer (e.g. over the phone)
  deposit: number;
  paid: number;
  status: BookingStatus;
  source: "walkin" | "online" | "phone";
  createdAt: string;
}

export interface Shift {
  id: string;
  userId: string;
  openedAt: string;
  closedAt?: string;
  openingFloat: number;
  countedCash?: number;
  notes: string;
}

export const REFUND_REASONS = [
  { value: "overcharge", label: "Charged too much / wrong price", hint: "Refund the difference between what was charged and the correct price.", partial: true },
  { value: "service", label: "Not satisfied / service issue", hint: "", partial: false },
  { value: "left_early", label: "Left early / didn't use the time", hint: "", partial: true },
  { value: "duplicate", label: "Paid twice / duplicate payment", hint: "Refund the duplicated amount.", partial: true },
  { value: "cancelled", label: "Visit or booking cancelled", hint: "", partial: false },
  { value: "other", label: "Other", hint: "", partial: false },
] as const;
export type RefundCategory = (typeof REFUND_REASONS)[number]["value"];

export interface RefundRequest {
  id: string;
  at: string;
  target: "ticket" | "sale" | "booking";
  targetId: string;
  label: string;
  maxAmount: number;
  amount: number;
  full: boolean;
  /** why the money goes back — see REFUND_REASONS */
  category?: RefundCategory;
  reason: string;
  method: PayMethod;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decidedAt?: string;
}

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Utilities",
  "Salaries",
  "EPF / ETF (Employer)",
  "Supplies",
  "Stock Purchases",
  "Maintenance & Cleaning",
  "Marketing",
  "Food & Party Supplies",
  "Bank & Card Fees",
  "Other",
  "Equipment (Capex)",
  "Owner Drawings",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  description: string;
  vendor: string;
  amount: number;
  paidFrom: "cash" | "bank";
  payrollRunId?: string;
  createdBy: string;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  designation: string;
  phone: string;
  nic: string;
  joinDate: string;
  basic: number;
  allowance: number;
  otRate: number; // per hour
  epf: boolean;
  etf: boolean;
  epfNo: string;
  bank: string;
  active: boolean;
  qrToken: string;
  color: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  method: "qr" | "manual";
}

export interface PayLine {
  employeeId: string;
  basic: number;
  allowance: number;
  otHours: number;
  otPay: number;
  deductions: number;
  gross: number;
  epfEmployee: number;
  epfEmployer: number;
  etfEmployer: number;
  net: number;
  epf: boolean;
  etf: boolean;
}

export interface PayrollRun {
  id: string;
  month: string; // yyyy-MM
  status: "draft" | "paid";
  lines: PayLine[];
  createdAt: string;
  paidAt?: string;
  createdBy: string;
}

export interface Activity {
  id: string;
  at: string;
  userId: string;
  module: string;
  action: string;
  detail: string;
  before?: string;
  after?: string;
}

export interface Settings {
  businessName: string;
  address: string;
  phone: string;
  email: string;
  receiptFooter: string;
  pointsPer100: number;
  pointValue: number;
  refundNeedsApproval: boolean;
  priceEditNeedsPermission: boolean;
  epfEnabled: boolean;
  etfEnabled: boolean;
  epfEmployeePct: number;
  epfEmployerPct: number;
  etfPct: number;
  epfIncludesAllowance: boolean;
  workStart: string;
  standardHours: number;
  openingCash: number;
  holidays: { date: string; name: string }[];
  backups: { id?: string; at: string; size: number; auto: boolean }[];
  /** WhatsApp messaging (see lib/whatsapp.ts for the defaults) */
  whatsapp?: Partial<import("./whatsapp").WhatsAppSettings>;
}

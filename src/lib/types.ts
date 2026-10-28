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
  /** the Staff record this login belongs to */
  employeeId?: string;
}

export interface Zone {
  id: string;
  name: string;
  kind: "play" | "party" | "cowork";
  capacity: number;
  nearFullPct: number;
  openTime: string; // "09:00"
  closeTime: string;
  minAge?: number;
  maxAge?: number;
  rules: string;
  active: boolean;
  color: string;
}

/** A zone's rate: the price of each 30 minutes, per child (play) / per person (cowork). */
export interface RatePlan {
  id: string;
  zoneId: string;
  price: number;
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
  /** staying past the booked end: price per hour (charged per started 30 min) for the party room / the whole venue */
  overtimeRoomPerHour?: number;
  overtimeFullPerHour?: number;
  /** minutes past the end that are free */
  overtimeGraceMin?: number;
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
  /** the party arrived (booking QR scanned at the venue) */
  checkedInAt?: string;
  /** the party left; any overtime was added to `total` then */
  checkedOutAt?: string;
  /** minutes past the booked end at check-out */
  overtimeMin?: number;
  /** charged for those minutes (0 when waived), already in `total` */
  overtimeCharge?: number;
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

export interface Expense {
  id: string;
  date: string;
  /** a name from settings.expenseCategories (see lib/accounting.ts) */
  category: string;
  description: string;
  vendor: string;
  amount: number;
  paidFrom: "cash" | "bank";
  payrollRunId?: string;
  createdBy: string;
}

/** A named allowance or deduction on a salary, e.g. "Transport" 5,000. */
export interface PayItem {
  name: string;
  amount: number;
  /** allowances only: counts towards the EPF/ETF base */
  epf?: boolean;
}

export interface Employee {
  id: string;
  code: string;
  name: string;
  designation: string;
  phone: string;
  nic: string;
  joinDate: string;
  /** monthly basic salary (permanent staff) */
  basic: number;
  /** absent on records from before employment types = permanent */
  employmentType?: EmploymentType;
  /** how they're paid, whatever the employment type; absent = monthly */
  payBasis?: PayBasis;
  /** pay per day (daily) or per hour (hourly) */
  rate?: number;
  /** fixed monthly allowances */
  allowances: PayItem[];
  /** recurring monthly deductions (loan instalments, welfare fund…) */
  deductions: PayItem[];
  otRate: number; // per hour
  epf: boolean;
  etf: boolean;
  epfNo: string;
  bank: string;
  active: boolean;
  qrToken: string;
  color: string;
  /** scheduled hours, for late / early arrivals — only sent to roles with "hr.hours" */
  workHours?: WorkHours;
  /** degrees, diplomas, professional certificates */
  qualifications?: Qualification[];
}

export interface Qualification {
  id: string;
  title: string;
  institution: string;
  /** year obtained (or "Reading") */
  year: string;
  notes?: string;
}

/** A training session the company ran or paid for, and who attended it. */
export interface Training {
  id: string;
  title: string;
  date: string;
  trainer: string;
  hours: number;
  description: string;
  employeeIds: string[];
}

/** A performance measure the business scores staff on (Settings → kpis). */
export interface Kpi {
  id: string;
  name: string;
  description?: string;
  /** relative importance in the overall score */
  weight: number;
  active: boolean;
}

/** One employee's KPI marks (0–10) for a month. One per employee and month: id = ev-<employeeId>-<yyyy-MM>. */
export interface Evaluation {
  id: string;
  employeeId: string;
  period: string;
  /** KPI id → mark 0–10 */
  scores: Record<string, number>;
  notes: string;
  evaluatedBy: string;
  at: string;
}

export interface WorkHours {
  /** "HH:mm" */
  start: string;
  end: string;
  /** working days, 0 = Sunday … 6 = Saturday */
  days: number[];
  /** minutes either side of the start time that still count as on time */
  graceMin: number;
}

/** what kind of employee they are — pay is chosen separately (PayBasis): monthly salary, per day or per hour */
export type EmploymentType = "permanent" | "non_permanent" | "part_time";
export type PayBasis = "monthly" | "daily" | "hourly";

export type Punctuality = "early" | "on_time" | "late" | "off_day";

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut?: string;
  method: "qr" | "manual";
  /** arrival against the employee's working hours, worked out by the server at clock-in (only sent to roles with "hr.hours") */
  scheduledIn?: string;
  /** minutes after the scheduled start (negative = before it) */
  inDiffMin?: number;
  punctuality?: Punctuality;
}

export interface PayLine {
  employeeId: string;
  /** monthly salary, or days / hours × rate (or the amount the administrator entered) */
  basic: number;
  /** absent on runs from before employment types = monthly */
  payBasis?: PayBasis;
  /** days (daily) or hours (hourly) paid for */
  units?: number;
  /** pay per day / hour when the run was prepared */
  rate?: number;
  /** total of `allowances` */
  allowance: number;
  /** this month's allowances (older runs only stored the total — see payroll.ts lineAllowances) */
  allowances?: PayItem[];
  otHours: number;
  otPay: number;
  /** total of `deductionItems` (EPF is separate) */
  deductions: number;
  /** this month's deductions, recurring and one-off (older runs only stored the total) */
  deductionItems?: PayItem[];
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
  /** what staff are scored on (Performance) */
  kpis?: Kpi[];
  /** weight of the attendance score (arrivals on time) in the overall performance score; 0 = left out, absent = 1 */
  attendanceWeight?: number;
  openingCash: number;
  /** income tax on profit, % — the P&L estimates tax at this rate; 0/absent = only tax payments recorded as expenses */
  incomeTaxPct?: number;
  holidays: { date: string; name: string }[];
  /** expense categories and where each goes in the P&L; absent = the defaults in lib/accounting.ts */
  expenseCategories?: import("./accounting").ExpenseCategoryDef[];
  backups: { id?: string; at: string; size: number; auto: boolean }[];
  /** play area + co-work in the same visit: a discount on the whole visit (absent/off = none) */
  comboDiscount?: { enabled: boolean; type: "percent" | "fixed"; value: number };
  /**
   * accompanying adults (guardians) in the play area: absent/off = free; on = charged per 30 min each,
   * either a % of the zone's child rate or a fixed amount
   */
  guardianRate?: { enabled: boolean; type: "percent" | "fixed"; value: number };
  /** automatic backups into the office PC's folder: times of day ("HH:mm") and days to keep (see lib/localBackup.ts) */
  localBackup?: { times: string[]; keepDays: number };
  /** WhatsApp messaging (see lib/whatsapp.ts for the defaults) */
  whatsapp?: Partial<import("./whatsapp").WhatsAppSettings>;
}

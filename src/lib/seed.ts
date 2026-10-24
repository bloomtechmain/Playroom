import { addDays, addMinutes, differenceInCalendarDays, format, setHours, setMinutes, startOfDay, startOfMonth, subDays, endOfMonth, subMonths } from "date-fns";
import { DEFAULT_ROLES } from "./permissions";
import { overtimeFor, quote } from "./pricing";
import type {
  Activity,
  Addon,
  Attendance,
  Booking,
  Child,
  Customer,
  Employee,
  Expense,
  PartyPackage,
  PayMethod,
  PayrollRun,
  PriceRule,
  Product,
  Promotion,
  RatePlan,
  RefundRequest,
  Role,
  Sale,
  Settings,
  Shift,
  Ticket,
  Transaction,
  User,
  Zone,
} from "./types";
import { calcPayLine } from "./payroll";
import { shiftSummary } from "./shift";

export interface DB {
  roles: Role[];
  users: User[];
  zones: Zone[];
  ratePlans: RatePlan[];
  rules: PriceRule[];
  promotions: Promotion[];
  customers: Customer[];
  children: Child[];
  tickets: Ticket[];
  transactions: Transaction[];
  products: Product[];
  sales: Sale[];
  packages: PartyPackage[];
  addons: Addon[];
  bookings: Booking[];
  shifts: Shift[];
  refunds: RefundRequest[];
  expenses: Expense[];
  employees: Employee[];
  attendance: Attendance[];
  payroll: PayrollRun[];
  activity: Activity[];
  settings: Settings;
  seededAt: string;
}

// small deterministic PRNG so the demo looks the same each reset
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export function buildSeed(): DB {
  const r = rng(20261019);
  const ri = (a: number, b: number) => Math.floor(r() * (b - a + 1)) + a;
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const D = (d: Date) => format(d, "yyyy-MM-dd");
  const at = (day: Date, h: number, m: number) => setMinutes(setHours(day, h), m);

  const settings: Settings = {
    businessName: "The Playroom",
    address: "No. 42, Duplication Road, Colombo 04",
    phone: "+94 77 123 4567",
    email: "hello@theplayroom.lk",
    receiptFooter: "Play, Grow, Shine! Thank you for visiting.",
    pointsPer100: 1,
    pointValue: 1,
    refundNeedsApproval: true,
    priceEditNeedsPermission: true,
    epfEnabled: true,
    etfEnabled: true,
    epfEmployeePct: 8,
    epfEmployerPct: 12,
    etfPct: 3,
    epfIncludesAllowance: false,
    workStart: "09:00",
    standardHours: 8,
    openingCash: 850000,
    holidays: [
      { date: "2026-09-26", name: "Binara Full Moon Poya" },
      { date: "2026-10-25", name: "Vap Full Moon Poya" },
      { date: "2026-11-08", name: "Deepavali" },
      { date: "2026-11-24", name: "Il Full Moon Poya" },
      { date: "2026-12-23", name: "Unduvap Full Moon Poya" },
      { date: "2026-12-25", name: "Christmas Day" },
    ],
    backups: [],
  };

  const created = iso(subDays(now, 200));
  const users: User[] = [
    { id: "u1", name: "Dilani Wijesekara", username: "owner", email: "dilani@theplayroom.lk", phone: "0771234567", roleId: "owner", active: true, password: "demo123", createdAt: created },
    { id: "u2", name: "Kasun Jayawardena", username: "admin", email: "kasun@theplayroom.lk", phone: "0712345678", roleId: "admin", active: true, password: "demo123", createdAt: created },
    { id: "u3", name: "Shehani Fernando", username: "manager", email: "shehani@theplayroom.lk", phone: "0763456789", roleId: "manager", active: true, password: "demo123", createdAt: created },
    { id: "u4", name: "Tharindu Silva", username: "cashier", email: "tharindu@theplayroom.lk", phone: "0754567890", roleId: "cashier", active: true, password: "demo123", createdAt: created },
    { id: "u5", name: "Ayesha Rizwan", username: "reception", email: "ayesha@theplayroom.lk", phone: "0705678901", roleId: "reception", active: true, password: "demo123", createdAt: created },
    { id: "u6", name: "Malsha Gunasekara", username: "party", email: "malsha@theplayroom.lk", phone: "0776789012", roleId: "party", active: true, password: "demo123", createdAt: created },
    { id: "u7", name: "Ruwan Herath", username: "accounts", email: "ruwan@theplayroom.lk", phone: "0717890123", roleId: "accountant", active: true, password: "demo123", createdAt: created },
    { id: "u8", name: "Pasan Kumara", username: "pasan", email: "pasan@theplayroom.lk", phone: "0778901234", roleId: "cashier", active: false, password: "demo123", createdAt: created },
  ];

  const zones: Zone[] = [
    { id: "z-play", name: "Kids Play Area", kind: "play", capacity: 40, nearFullPct: 80, openTime: "09:00", closeTime: "20:00", basePrice: 1500, minAge: 1, maxAge: 12, rules: "Grip socks required. Under 4s must have a guardian inside. No food in the soft-play.", active: true, color: "sky" },
    { id: "z-party", name: "Party Room", kind: "party", capacity: 40, nearFullPct: 90, openTime: "10:00", closeTime: "21:00", basePrice: 0, rules: "Bookings only. Outside cakes allowed. Setup starts 30 min before.", active: true, color: "rose" },
    { id: "z-cowork", name: "Co-Work Lounge", kind: "cowork", capacity: 12, nearFullPct: 75, openTime: "08:00", closeTime: "20:00", basePrice: 800, rules: "Quiet zone. Wi-Fi and coffee refills included.", active: true, color: "mint" },
  ];

  const ratePlans: RatePlan[] = [
    { id: "rp1", zoneId: "z-play", name: "Half Hour", unit: "half", minutes: 30, price: 900, graceMinutes: 5, overtimeBlock: 15, overtimePrice: 300, active: true },
    { id: "rp2", zoneId: "z-play", name: "1 Hour", unit: "hour", minutes: 60, price: 1500, graceMinutes: 10, overtimeBlock: 15, overtimePrice: 300, active: true },
    { id: "rp3", zoneId: "z-play", name: "2 Hours", unit: "custom", minutes: 120, price: 2600, graceMinutes: 10, overtimeBlock: 15, overtimePrice: 300, active: true },
    { id: "rp4", zoneId: "z-play", name: "Day Pass", unit: "custom", minutes: 480, price: 4000, graceMinutes: 15, overtimeBlock: 30, overtimePrice: 400, active: true },
    { id: "rp5", zoneId: "z-cowork", name: "Hourly Desk", unit: "hour", minutes: 60, price: 800, graceMinutes: 10, overtimeBlock: 30, overtimePrice: 400, active: true },
    { id: "rp6", zoneId: "z-cowork", name: "Half Day (4h)", unit: "custom", minutes: 240, price: 2500, graceMinutes: 15, overtimeBlock: 30, overtimePrice: 400, active: true },
    { id: "rp7", zoneId: "z-cowork", name: "Full Day", unit: "custom", minutes: 600, price: 4200, graceMinutes: 15, overtimeBlock: 60, overtimePrice: 500, active: true },
  ];

  const rules: PriceRule[] = [
    { id: "pr1", name: "Weekend rate", kind: "weekend", days: [0, 6], start: "00:00", end: "23:59", adjust: "percent", value: 15, zoneIds: ["z-play"], active: true },
    { id: "pr2", name: "Weekday morning off-peak", kind: "offpeak", days: [1, 2, 3, 4, 5], start: "09:00", end: "12:00", adjust: "percent", value: -10, zoneIds: ["z-play"], active: true },
    { id: "pr3", name: "Friday evening peak", kind: "peak", days: [5], start: "16:00", end: "20:00", adjust: "fixed", value: 200, zoneIds: ["z-play"], active: true },
    { id: "pr4", name: "Public & Poya holiday", kind: "holiday", days: [], start: "00:00", end: "23:59", adjust: "percent", value: 20, zoneIds: ["z-play", "z-cowork"], active: true },
    { id: "pr5", name: "Halloween Spooky Day", kind: "event", days: [], date: "2026-10-31", start: "00:00", end: "23:59", adjust: "fixed", value: 500, zoneIds: ["z-play"], active: true },
    { id: "pr6", name: "Co-work weekday early bird", kind: "offpeak", days: [1, 2, 3, 4, 5], start: "08:00", end: "10:00", adjust: "percent", value: -15, zoneIds: ["z-cowork"], active: true },
  ];

  const promotions: Promotion[] = [
    { id: "pm1", code: "MEMBER15", name: "Members save 15%", type: "percent", value: 15, validFrom: "2026-01-01", validTo: "2026-12-31", usageCap: 0, used: 0, auto: true, active: true, zoneIds: [], targeting: { membersOnly: true } },
    { id: "pm2", code: "SIBLING3", name: "Sibling pack — 3 kids, 1 hour", type: "package", value: 3600, packageKids: 3, validFrom: "2026-06-01", validTo: "2026-12-31", usageCap: 300, used: 0, auto: false, active: true, zoneIds: ["z-play"], targeting: {} },
    { id: "pm3", code: "TINYTOTS", name: "Tiny tots Rs. 300 off", type: "fixed", value: 300, validFrom: "2026-08-01", validTo: "2026-11-30", usageCap: 500, used: 0, auto: false, active: true, zoneIds: ["z-play"], targeting: { childMaxAge: 3 } },
    { id: "pm4", code: "PLAYMORE", name: "Spend 4,000+ get 30 min free", type: "bonus_time", value: 30, validFrom: "2026-09-01", validTo: "2026-12-31", usageCap: 200, used: 0, auto: false, active: true, zoneIds: ["z-play"], targeting: { minSpend: 4000 } },
    { id: "pm5", code: "LOYAL500", name: "Regulars Rs. 500 off", type: "fixed", value: 500, validFrom: "2026-07-01", validTo: "2026-12-31", usageCap: 0, used: 0, auto: false, active: true, zoneIds: [], targeting: { minPriorVisits: 5, minSpend: 2500 } },
    { id: "pm6", code: "SUMMER25", name: "Summer holidays 25%", type: "percent", value: 25, validFrom: "2026-04-01", validTo: "2026-05-31", usageCap: 400, used: 288, auto: false, active: true, zoneIds: ["z-play"], targeting: {} },
  ];

  // ---------- CRM ----------
  const surnames = ["Perera", "Fernando", "de Silva", "Jayasinghe", "Wickramasinghe", "Bandara", "Gunawardena", "Dissanayake", "Herath", "Ranasinghe", "Senanayake", "Amarasinghe", "Rathnayake", "Mendis", "Weerasinghe", "Karunaratne", "Samarawickrama", "Nadarajah", "Sivakumar", "Mohamed", "Cassim", "Abeysekera", "Kodikara", "Liyanage", "Peiris", "Wijeratne", "Rajendran", "Hettiarachchi", "Seneviratne", "Ekanayake"];
  const parentFirst = ["Nadeeka", "Chaminda", "Sanduni", "Ishara", "Ruwani", "Dinesh", "Hiruni", "Lahiru", "Thilini", "Asanka", "Fathima", "Kavitha", "Ramesh", "Nirosha", "Gayan", "Anjali", "Shamila", "Udara", "Mihiri", "Roshan", "Zainab", "Pradeep", "Harini", "Nuwan", "Dilshan", "Sachini", "Vimukthi", "Janani", "Imran", "Tharushi", "Ashan", "Piumi"];
  const kidNames = { girl: ["Senuli", "Thisuri", "Hasini", "Amaya", "Nethmi", "Sayuri", "Aisha", "Kavya", "Dinara", "Methuli", "Inaya", "Sanaya", "Yenuli", "Disara"], boy: ["Senuth", "Kavindu", "Thenuk", "Yohan", "Rayan", "Dulneth", "Ovin", "Aarav", "Sehas", "Minul", "Ayaan", "Nethan", "Vihas", "Chenul"] };

  const customers: Customer[] = [];
  const children: Child[] = [];
  for (let i = 0; i < 140; i++) {
    const sur = surnames[(i * 7) % surnames.length];
    const first = parentFirst[i % parentFirst.length];
    const id = `c${i + 1}`;
    customers.push({
      id,
      name: `${first} ${sur}`,
      phone: `07${pick(["0", "1", "2", "5", "6", "7", "8"])}${ri(1000000, 9999999)}`,
      email: `${first.toLowerCase()}.${sur.toLowerCase().replace(/ /g, "")}${i >= 60 ? i : ""}@gmail.com`,
      address: pick(["Colombo 05", "Nugegoda", "Rajagiriya", "Dehiwala", "Colombo 07", "Battaramulla", "Kotte", "Wellawatte", "Mount Lavinia", "Maharagama"]),
      member: r() < 0.35,
      points: 0,
      wallet: r() < 0.2 ? pick([2000, 3500, 5000, 1200]) : 0,
      notes: r() < 0.15 ? pick(["Prefers weekend mornings", "Twins — please seat together", "Asked about birthday packages", "Corporate parent, uses co-work"]) : "",
      createdAt: iso(subDays(now, ri(80, 400))),
    });
    const nKids = pick([1, 1, 2, 2, 2, 3]);
    for (let k = 0; k < nKids; k++) {
      const gender = r() < 0.5 ? "girl" : "boy";
      children.push({
        id: `k${children.length + 1}`,
        guardianId: id,
        name: `${pick(kidNames[gender])} ${sur.split(" ").pop()}`,
        dob: D(subDays(now, ri(365 * 1 + 30, 365 * 11))),
        gender,
        allergies: r() < 0.1 ? pick(["Peanuts", "Dairy", "Eggs"]) : "",
      });
    }
  }

  // ---------- Products ----------
  const products: Product[] = [
    ["Juice Box (Orange)", "Drinks", 250, 140, 64],
    ["Bottled Water 500ml", "Drinks", 120, 60, 110],
    ["Iced Milo", "Drinks", 400, 170, 40],
    ["Fresh Lime Juice", "Drinks", 350, 120, 30],
    ["Cappuccino", "Café", 650, 210, 80],
    ["Black Coffee", "Café", 450, 120, 80],
    ["Chicken Sandwich", "Café", 650, 320, 22],
    ["Kids Cheese Toastie", "Café", 450, 190, 25],
    ["Popcorn Cup", "Snacks", 300, 90, 48],
    ["Chocolate Cupcake", "Snacks", 300, 130, 30],
    ["Ice Cream Cup", "Snacks", 350, 160, 36],
    ["Fruit Cup", "Snacks", 400, 200, 4],
    ["Grip Socks — Small", "Socks & Gear", 650, 260, 40],
    ["Grip Socks — Medium", "Socks & Gear", 650, 260, 33],
    ["Grip Socks — Large", "Socks & Gear", 750, 300, 3],
    ["Bubble Wand", "Toys", 550, 240, 24],
    ["Play-Dough Set", "Toys", 900, 450, 15],
    ["Mini Toy Car", "Toys", 750, 330, 19],
    ["Balloon Pack (10)", "Toys", 400, 150, 27],
    ["Hair Clips Set", "Toys", 350, 120, 18],
  ].map(([name, category, price, cost, stock], i) => ({
    id: `p${i + 1}`,
    name: name as string,
    category: category as string,
    sku: `PR-${String(1001 + i)}`,
    price: price as number,
    cost: cost as number,
    stock: stock as number,
    reorderAt: 8,
    active: true,
  }));

  // ---------- Party ----------
  const packages: PartyPackage[] = [
    { id: "pk1", name: "Little Stars", roomZoneId: "z-party", guestLimit: 15, durationMin: 120, priceRoomOnly: 35000, priceFullVenue: 60000, extraGuestPrice: 1500, depositPct: 30, includes: ["Party host", "Balloon set", "Invitation cards", "Juice for kids"], active: true },
    { id: "pk2", name: "Super Party", roomZoneId: "z-party", guestLimit: 25, durationMin: 180, priceRoomOnly: 55000, priceFullVenue: 90000, extraGuestPrice: 1800, depositPct: 30, includes: ["Host & party games", "Themed table decor", "Face painting", "Return gifts"], active: true },
    { id: "pk3", name: "Mega Bash", roomZoneId: "z-party", guestLimit: 40, durationMin: 180, priceRoomOnly: 80000, priceFullVenue: 125000, extraGuestPrice: 1600, depositPct: 40, includes: ["2 hosts", "Full theme decoration", "Magic or bubble show", "Return gifts", "Photo corner"], active: true },
  ];
  const addons: Addon[] = [
    { id: "a1", name: "Magic Show (45 min)", kind: "addon", price: 12000, perHead: false, active: true },
    { id: "a2", name: "Face Painting", kind: "addon", price: 6000, perHead: false, active: true },
    { id: "a3", name: "Bubble Show", kind: "addon", price: 9000, perHead: false, active: true },
    { id: "a4", name: "Photo Booth + Prints", kind: "addon", price: 8000, perHead: false, active: true },
    { id: "a5", name: "Kids Meal Box", kind: "food", price: 850, perHead: true, active: true },
    { id: "a6", name: "Savoury Snack Platter", kind: "food", price: 450, perHead: true, active: true },
    { id: "a7", name: "Birthday Cake (2kg)", kind: "food", price: 7500, perHead: false, active: true },
    { id: "a8", name: "Theme Backdrop", kind: "decor", price: 10000, perHead: false, active: true },
    { id: "a9", name: "Balloon Arch", kind: "decor", price: 7500, perHead: false, active: true },
  ];
  const themes = ["Frozen", "Dinosaur Park", "Unicorn & Rainbows", "Spider-Man", "Under the Sea", "Space Explorer", "Jungle Safari", "Princess Garden"];

  // ---------- Staff ----------
  const empColors = ["sky", "lilac", "mint", "rose", "sun", "teal"];
  const employees: Employee[] = [
    ["Kasun Jayawardena", "Operations Administrator", 105000, 15000, true],
    ["Shehani Fernando", "Floor Manager", 120000, 15000, true],
    ["Tharindu Silva", "Cashier", 55000, 7500, true],
    ["Ayesha Rizwan", "Receptionist", 55000, 7500, true],
    ["Malsha Gunasekara", "Party Manager", 85000, 10000, true],
    ["Ruwan Herath", "Accountant", 95000, 10000, true],
    ["Nadeesha Kumari", "Play Attendant", 45000, 5000, true],
    ["Sajith Bandara", "Play Attendant", 45000, 5000, true],
    ["Priya Nadarajah", "Housekeeping", 40000, 4000, true],
    ["Chamath Dias", "Party Host (Part-time)", 38000, 0, false],
  ].map(([name, designation, basic, allowance, epf], i) => ({
    id: `e${i + 1}`,
    code: `EMP-${String(101 + i)}`,
    name: name as string,
    designation: designation as string,
    phone: `07${ri(10000000, 89999999)}`,
    nic: `${ri(198500000, 200299999)}${ri(1000, 9999)}`,
    joinDate: D(subDays(now, ri(120, 900))),
    basic: basic as number,
    allowance: allowance as number,
    otRate: Math.round(((basic as number) / 240) * 1.5),
    epf: epf as boolean,
    etf: epf as boolean,
    epfNo: epf ? `EPF/${ri(10000, 99999)}` : "",
    bank: pick(["BOC", "Commercial Bank", "Sampath", "HNB", "People's Bank"]) + ` · ${ri(1000000000, 9999999999)}`,
    active: true,
    qrToken: Math.floor(r() * 1e9).toString(36).toUpperCase(),
    color: empColors[i % empColors.length],
  }));

  // ---------- Generate history ----------
  const tickets: Ticket[] = [];
  const transactions: Transaction[] = [];
  const sales: Sale[] = [];
  const bookings: Booking[] = [];
  const shifts: Shift[] = [];
  const expenses: Expense[] = [];
  const attendance: Attendance[] = [];
  const refunds: RefundRequest[] = [];
  const activity: Activity[] = [];
  const priorVisits: Record<string, number> = {};
  let txn = 0;
  const tx = (t: Omit<Transaction, "id">) => transactions.push({ ...t, id: `t${++txn}` });
  const pickMethod = (): PayMethod => {
    const x = r();
    return x < 0.44 ? "cash" : x < 0.79 ? "card" : x < 0.92 ? "digital" : x < 0.96 ? "transfer" : "wallet";
  };
  const ageOfAt = (dob: string, d: Date) => Math.floor((d.getTime() - new Date(dob).getTime()) / (365.25 * 864e5));

  // history from the 1st of the month two months back, so full months show in reports
  const DAYS = differenceInCalendarDays(now, startOfMonth(subMonths(now, 2)));
  const isHoliday = (d: Date) => settings.holidays.some((h) => h.date === D(d));
  let bookingSeq = 1000;

  for (let back = DAYS; back >= 0; back--) {
    const day = startOfDay(subDays(now, back));
    const dkey = D(day);
    const isToday = back === 0;
    const dow = day.getDay();
    const weekend = dow === 0 || dow === 6;
    const shiftId = `sh-${dkey}`;
    const cashierId = pick(["u4", "u4", "u4", "u5"]);
    shifts.push({ id: shiftId, userId: cashierId, openedAt: iso(at(day, 8, 45)), closedAt: isToday ? undefined : iso(at(day, 20, 20)), openingFloat: 15000, notes: "" });
    let seq = 0;
    const codeFor = () => `PR${format(day, "yyMMdd")}-${String(++seq).padStart(4, "0")}`;

    const makeTicket = (zoneId: string, checkIn: Date, forceActive = false) => {
      const zone = zones.find((z) => z.id === zoneId)!;
      const plans = ratePlans.filter((p) => p.zoneId === zoneId);
      const plan = zoneId === "z-play" ? pick([plans[0], plans[1], plans[1], plans[1], plans[2], plans[2], plans[3]]) : pick([plans[0], plans[0], plans[1], plans[2]]);
      const cust = pick(customers);
      const kids = children.filter((c) => c.guardianId === cust.id);
      const chosen = zoneId === "z-play" ? kids.slice(0, ri(1, kids.length)) : [];
      const visitors = zoneId === "z-play" ? chosen.length : ri(1, 2);
      let promo: Promotion | undefined;
      const ctx = { at: checkIn, zone, plan, visitors, adults: zoneId === "z-play" ? ri(1, 2) : 0, childAges: chosen.map((c) => ageOfAt(c.dob, checkIn)), member: cust.member, priorVisits: priorVisits[cust.id] ?? 0 };
      if (cust.member) promo = promotions[0];
      else if (visitors === 3 && r() < 0.6) promo = promotions[1];
      else if (r() < 0.08) promo = promotions[2];
      else if (r() < 0.05) promo = promotions[4];
      const q = quote(ctx, rules, settings, promo, 0);
      if (promo && q.promoError) promo = undefined;
      const q2 = promo ? q : quote(ctx, rules, settings, undefined, 0);
      if (promo) promo.used++;
      priorVisits[cust.id] = (priorVisits[cust.id] ?? 0) + 1;
      const t: Ticket = {
        id: `tk-${dkey}-${seq + 1}`,
        code: codeFor(),
        customerId: cust.id,
        childIds: chosen.map((c) => c.id),
        visitors,
        adults: ctx.adults,
        zoneId,
        ratePlanId: plan.id,
        minutes: q2.minutes,
        checkIn: iso(checkIn),
        status: "active",
        base: q2.base,
        ruleAdjust: q2.ruleAdjust,
        ruleNames: q2.applied.map((x) => x.name),
        promoId: promo?.id,
        discount: q2.discount,
        loyaltyUsed: 0,
        overtimeFee: 0,
        total: q2.total,
        paid: q2.total,
        createdBy: cashierId,
        reprints: 0,
      };
      // payment is taken at check-out: session price + any overtime, in one go
      const method = cust.wallet > q2.total && r() < 0.5 ? "wallet" : pickMethod();
      const kind = zoneId === "z-play" ? "play" : "cowork";
      t.paid = 0;
      const endPlanned = addMinutes(checkIn, t.minutes);
      const x = r();
      if (!isToday && x < 0.012) {
        // cancelled before play started — nothing was charged
        t.status = "cancelled";
        t.checkOut = iso(addMinutes(checkIn, 4));
      } else if (!forceActive) {
        const out = addMinutes(endPlanned, ri(-12, r() < 0.25 ? 45 : 10));
        if (out < now) {
          t.checkOut = iso(out);
          t.status = "completed";
          const ot = overtimeFor(t, plan, out);
          t.paid = t.total;
          tx({ at: t.checkOut, type: kind, method, amount: t.total, ref: t.id, refLabel: t.code, customerId: cust.id, shiftId, userId: cashierId, discount: t.discount });
          if (ot.fee > 0) {
            t.overtimeFee = ot.fee;
            t.total += ot.fee;
            t.paid += ot.fee;
            tx({ at: t.checkOut, type: "overtime", method, amount: ot.fee, ref: t.id, refLabel: t.code, customerId: cust.id, shiftId, userId: cashierId, discount: 0 });
          }
          if (method === "wallet") cust.wallet = Math.max(0, cust.wallet - t.paid);
          cust.points += Math.floor((t.paid / 100) * settings.pointsPer100);
          if (!isToday && x < 0.022) {
            t.status = "refunded";
            const rm = method === "wallet" ? "cash" : method;
            const amt = Math.round(t.paid / 2);
            tx({ at: t.checkOut, type: "refund", revenueType: kind, method: rm, amount: -amt, ref: t.id, refLabel: t.code, customerId: cust.id, shiftId, userId: "u3", discount: 0 });
            refunds.push({ id: `rf${refunds.length + 1}`, at: t.checkOut, target: "ticket", targetId: t.id, label: t.code, maxAmount: t.paid, amount: amt, full: false, reason: pick(["Child unwell, left early", "Equipment closed for cleaning", "Charged wrong package"]), method: rm, requestedBy: cashierId, status: "approved", decidedBy: "u3", decidedAt: t.checkOut });
            t.paid -= amt;
          }
        } else if (!isToday) {
          t.status = "expired";
        }
      }
      tickets.push(t);
      return t;
    };

    // play tickets
    const holidayBoost = isHoliday(day) ? 1.3 : 1;
    const nPlay = Math.round((weekend ? ri(24, 36) : ri(12, 22)) * holidayBoost);
    for (let i = 0; i < nPlay; i++) {
      const mins = ri(9 * 60 + 15, 18 * 60 + 15);
      const ci = addMinutes(day, mins);
      if (isToday && ci > subMinutesSafe(now, 110)) continue;
      makeTicket("z-play", ci);
    }
    const nCow = weekend ? ri(1, 3) : ri(3, 8);
    for (let i = 0; i < nCow; i++) {
      const ci = addMinutes(day, ri(8 * 60 + 10, 15 * 60));
      if (isToday && ci > subMinutesSafe(now, 110)) continue;
      makeTicket("z-cowork", ci);
    }
    if (isToday) {
      // live floor: kids currently inside
      for (let i = 0; i < 17; i++) makeTicket("z-play", subMinutesSafe(now, ri(4, 95)), true);
      for (let i = 0; i < 5; i++) makeTicket("z-cowork", subMinutesSafe(now, ri(10, 200)), true);
      // a couple who are overstaying
      const late = tickets.filter((t) => t.status === "active" && t.zoneId === "z-play").slice(0, 2);
      late.forEach((t) => {
        t.checkIn = iso(subMinutesSafe(now, t.minutes + ri(20, 35)));
      });
    }

    // POS sales
    const nSales = weekend ? ri(12, 20) : ri(7, 13);
    for (let i = 0; i < nSales; i++) {
      const sat = addMinutes(day, ri(9 * 60 + 30, 19 * 60 + 30));
      if (isToday && sat > now) continue;
      const items = Array.from({ length: ri(1, 3) }, () => {
        const p = pick(products);
        return { productId: p.id, name: p.name, qty: ri(1, 2), price: p.price, cost: p.cost };
      });
      const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
      const discount = r() < 0.06 ? Math.round(subtotal * 0.1) : 0;
      const method = pickMethod() === "wallet" ? "cash" : pickMethod();
      const total = subtotal - discount;
      const sale: Sale = { id: `s-${dkey}-${i}`, no: `S${format(day, "yyMMdd")}-${String(i + 1).padStart(3, "0")}`, at: iso(sat), items, subtotal, discount, total, method: method === "wallet" ? "cash" : method, tendered: total, userId: cashierId, shiftId };
      sales.push(sale);
      tx({ at: sale.at, type: "pos", method: sale.method, amount: total, ref: sale.id, refLabel: sale.no, shiftId, userId: cashierId, discount });
    }

    // party bookings (past + a few in this loop; future generated below)
    const nParties = weekend ? ri(0, 2) : r() < 0.12 ? 1 : 0;
    const slots = [["11:00", "14:00"], ["15:00", "18:00"], ["18:30", "21:00"]];
    for (let i = 0; i < nParties && !isToday; i++) {
      const pkg = pick(packages);
      const full = r() < 0.25;
      const [start] = slots[i];
      const endM = parseInt(start) * 60 + parseInt(start.slice(3)) + pkg.durationMin;
      const end = `${String(Math.floor(endM / 60)).padStart(2, "0")}:${String(endM % 60).padStart(2, "0")}`;
      const cust = pick(customers);
      const guests = ri(Math.round(pkg.guestLimit * 0.7), pkg.guestLimit + 6);
      const ad = r() < 0.6 ? [pick(addons.filter((a) => a.kind === "addon")).id, "a5"] : ["a7"];
      const extra = Math.max(0, guests - pkg.guestLimit) * pkg.extraGuestPrice;
      const addonTotal = ad.reduce((s, id) => {
        const a = addons.find((x) => x.id === id)!;
        return s + (a.perHead ? a.price * guests : a.price);
      }, 0);
      const total = (full ? pkg.priceFullVenue : pkg.priceRoomOnly) + extra + addonTotal;
      const deposit = Math.round((total * pkg.depositPct) / 100);
      const createdAt = subDays(day, ri(7, 25));
      const b: Booking = { id: `b${++bookingSeq}`, ref: `BK-${bookingSeq}`, kind: "party", mode: full ? "full" : "room", customerId: cust.id, date: dkey, start, end, zoneId: "z-party", packageId: pkg.id, guests, kids: Math.round(guests * 0.75), addonIds: ad, theme: pick(themes), notes: "", total, deposit, paid: total, status: "completed", source: r() < 0.45 ? "online" : "phone", createdAt: iso(createdAt) };
      bookings.push(b);
      tx({ at: iso(at(createdAt, 11, 0)), type: "deposit", method: b.source === "online" ? "online" : pick(["transfer", "card", "cash"]), amount: deposit, ref: b.id, refLabel: b.ref, customerId: cust.id, userId: "u6", discount: 0 });
      tx({ at: iso(at(day, parseInt(start) - 1, 30)), type: "party", method: pick(["card", "cash", "transfer"]), amount: total - deposit, ref: b.id, refLabel: b.ref, customerId: cust.id, shiftId, userId: "u6", discount: 0 });
    }

    // attendance (last 45 days)
    if (back <= 45) {
      employees.forEach((e, i) => {
        if ((dow + i) % 7 === 3) return; // weekly day off, staggered
        if (r() < 0.04) return; // leave
        const inT = addMinutes(at(day, 8, 40), ri(0, 38));
        if (isToday && inT > now) return;
        const outT = addMinutes(at(day, 17, 0), ri(0, 150));
        attendance.push({ id: `at-${dkey}-${e.id}`, employeeId: e.id, date: dkey, clockIn: iso(inT), clockOut: isToday ? undefined : iso(outT), method: r() < 0.93 ? "qr" : "manual" });
      });
    }
  }

  // wallet top-ups for customers with balance
  customers
    .filter((c) => c.wallet > 0)
    .forEach((c, i) => tx({ at: iso(subDays(now, 10 + i * 3)), type: "topup", method: pick(["cash", "card"]), amount: c.wallet + 3000, ref: c.id, refLabel: "Wallet top-up", customerId: c.id, userId: "u4", discount: 0 }));

  // future bookings
  const futureSlots: [string, string][] = [["11:00", "14:00"], ["15:00", "18:00"]];
  for (let f = 1; f <= 34; f++) {
    const day = startOfDay(addDays(now, f));
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const n = weekend ? ri(1, 2) : r() < 0.25 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const pkg = pick(packages);
      const full = r() < 0.3;
      const [start, end] = futureSlots[i];
      const cust = pick(customers);
      const guests = ri(Math.round(pkg.guestLimit * 0.6), pkg.guestLimit + 4);
      const total = (full ? pkg.priceFullVenue : pkg.priceRoomOnly) + Math.max(0, guests - pkg.guestLimit) * pkg.extraGuestPrice + (r() < 0.5 ? 12000 : 7500);
      const deposit = Math.round((total * pkg.depositPct) / 100);
      const pending = r() < 0.2;
      const b: Booking = { id: `b${++bookingSeq}`, ref: `BK-${bookingSeq}`, kind: "party", mode: full ? "full" : "room", customerId: cust.id, date: D(day), start, end, zoneId: "z-party", packageId: pkg.id, guests, kids: Math.round(guests * 0.75), addonIds: r() < 0.5 ? ["a1"] : ["a7"], theme: pick(themes), notes: "", total, deposit, paid: pending ? 0 : deposit, status: pending ? "pending" : "confirmed", source: r() < 0.5 ? "online" : "phone", createdAt: iso(subDays(now, ri(1, 12))) };
      if (r() < 0.08) b.status = "cancelled";
      bookings.push(b);
      if (b.paid) tx({ at: b.createdAt, type: "deposit", method: b.source === "online" ? "online" : "transfer", amount: b.paid, ref: b.id, refLabel: b.ref, customerId: cust.id, userId: "u6", discount: 0 });
    }
    if (f % 3 === 0) {
      const cust = pick(customers);
      bookings.push({ id: `b${++bookingSeq}`, ref: `BK-${bookingSeq}`, kind: "play", customerId: cust.id, date: D(day), start: pick(["10:00", "11:30", "15:00"]), end: pick(["12:00", "13:30", "17:00"]), zoneId: "z-play", guests: 3, kids: 2, addonIds: [], theme: "", notes: "Online play reservation", total: 3000, deposit: 1000, paid: 1000, status: "confirmed", source: "online", createdAt: iso(subDays(now, 2)) });
    }
  }
  // today: a room-only party now, and a full-venue party later today to show the lockout
  {
    const nowM = now.getHours() * 60 + now.getMinutes();
    const t = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const s1 = Math.max(10 * 60, Math.floor((nowM - 60) / 30) * 30);
    const cust1 = customers[3];
    bookings.push({ id: `b${++bookingSeq}`, ref: `BK-${bookingSeq}`, kind: "party", mode: "room", customerId: cust1.id, date: D(now), start: t(Math.min(s1, 20 * 60)), end: t(Math.min(s1 + 180, 23 * 60 + 30)), zoneId: "z-party", packageId: "pk2", guests: 22, kids: 16, addonIds: ["a2", "a5"], theme: "Dinosaur Park", notes: "Cake arriving 30 min early", total: 55000 + 6000 + 850 * 22, deposit: 22305, paid: 22305, status: "confirmed", source: "phone", createdAt: iso(subDays(now, 9)) });
    tx({ at: iso(subDays(now, 9)), type: "deposit", method: "transfer", amount: 22305, ref: `b${bookingSeq}`, refLabel: `BK-${bookingSeq}`, customerId: cust1.id, userId: "u6", discount: 0 });
    const s2 = Math.ceil((nowM + 90) / 30) * 30;
    if (s2 + 120 < 24 * 60) {
      const cust2 = customers[7];
      bookings.push({ id: `b${++bookingSeq}`, ref: `BK-${bookingSeq}`, kind: "party", mode: "full", customerId: cust2.id, date: D(now), start: t(s2), end: t(Math.min(s2 + 180, 23 * 60 + 59)), zoneId: "z-party", packageId: "pk3", guests: 38, kids: 30, addonIds: ["a1", "a8"], theme: "Space Explorer", notes: "Exclusive full-venue hire — play area closed to walk-ins", total: 125000 + 12000 + 10000, deposit: 58800, paid: 58800, status: "confirmed", source: "online", createdAt: iso(subDays(now, 14)) });
      tx({ at: iso(subDays(now, 14)), type: "deposit", method: "online", amount: 58800, ref: `b${bookingSeq}`, refLabel: `BK-${bookingSeq}`, customerId: cust2.id, userId: "u6", discount: 0 });
    }
  }

  // ---------- Expenses ----------
  const months = [2, 1, 0].map((m) => subMonths(now, m));
  months.forEach((m, mi) => {
    const y = m.getFullYear();
    const mo = m.getMonth();
    const dt = (d: number) => D(new Date(y, mo, d));
    const add = (d: number, category: Expense["category"], description: string, vendor: string, amount: number, paidFrom: "cash" | "bank" = "bank") => {
      const date = new Date(y, mo, d);
      if (date > now || date < subDays(now, DAYS)) return;
      expenses.push({ id: `x${expenses.length + 1}`, date: dt(d), category, description, vendor, amount, paidFrom, createdBy: "u7" });
    };
    add(1, "Rent", "Monthly rent — ground floor", "Lakshmi Holdings (Pvt) Ltd", 650000);
    add(9, "Utilities", "Electricity (CEB)", "Ceylon Electricity Board", ri(145000, 185000));
    add(11, "Utilities", "Water (NWSDB)", "NWS&DB", ri(8000, 12500));
    add(14, "Utilities", "Fibre internet 300Mbps", "SLT-Mobitel", 12990);
    add(3, "Maintenance & Cleaning", "Deep clean & sanitising", "CleanCo Services", ri(38000, 52000));
    add(18, "Maintenance & Cleaning", "Soft-play repairs", "Kidz Play Fitouts", ri(9000, 18000), "cash");
    add(6, "Marketing", "Facebook & Instagram ads", "Meta Platforms", ri(45000, 60000));
    add(15, "Marketing", "Influencer & school flyer campaign", "Little Lanka Media", ri(30000, 45000));
    add(5, "Stock Purchases", "Café & snack restock", "Cargills Wholesale", ri(45000, 70000));
    add(19, "Stock Purchases", "Grip socks & toys restock", "Toy World Distributors", ri(30000, 50000));
    add(26, "Bank & Card Fees", "Card terminal MDR", "Commercial Bank", ri(14000, 21000));
    [4, 12, 20, 27].forEach((d) => add(d, "Supplies", pick(["Tissues, wipes & sanitiser", "Cleaning supplies", "Craft & art supplies", "Paper cups & plates"]), "Keells Super", ri(6000, 16000), "cash"));
    [8, 22].forEach((d) => add(d, "Food & Party Supplies", "Party food & decor supplies", "Perera & Sons Bakers", ri(28000, 52000)));
    add(28, "Owner Drawings", "Owner drawings", "D. Wijesekara", 250000);
    add(20, "Other", "Insurance — public liability (monthly)", "Ceylinco Insurance", 28500);
    add(24, "Other", "Accounting & payroll software", "Cloud subscriptions", 18500);
    if (mi === 1) add(16, "Equipment (Capex)", "New ball-pit balls & soft mats", "Kidz Play Fitouts", 285000);
  });

  // ---------- Payroll (previous 2 months, paid) ----------
  const payroll: PayrollRun[] = [];
  [2, 1].forEach((mBack) => {
    const m = subMonths(now, mBack);
    const month = format(m, "yyyy-MM");
    const paidOn = endOfMonth(m);
    const lines = employees.map((e) => calcPayLine(e, settings, ri(0, 14), e.id === "e7" ? 2500 : 0));
    const run: PayrollRun = { id: `pay-${month}`, month, status: "paid", lines, createdAt: iso(subDays(paidOn, 2)), paidAt: iso(paidOn), createdBy: "u7" };
    payroll.push(run);
    if (paidOn >= subDays(now, DAYS)) {
      const gross = lines.reduce((s, l) => s + l.gross, 0);
      const er = lines.reduce((s, l) => s + l.epfEmployer + l.etfEmployer, 0);
      expenses.push({ id: `x${expenses.length + 1}`, date: D(paidOn), category: "Salaries", description: `Salaries — ${format(m, "MMMM yyyy")}`, vendor: "Staff payroll", amount: gross, paidFrom: "bank", payrollRunId: run.id, createdBy: "u7" });
      expenses.push({ id: `x${expenses.length + 1}`, date: D(paidOn), category: "EPF / ETF (Employer)", description: `Employer EPF 12% + ETF 3% — ${format(m, "MMM yyyy")}`, vendor: "Central Bank / ETF Board", amount: er, paidFrom: "bank", payrollRunId: run.id, createdBy: "u7" });
    }
  });

  // pending refund requests to show approval flow
  const recent = tickets.filter((t) => t.status === "completed").slice(-3);
  refunds.push({ id: `rf${refunds.length + 1}`, at: iso(subMinutesSafe(now, 40)), target: "ticket", targetId: recent[0].id, label: recent[0].code, maxAmount: recent[0].paid, amount: recent[0].paid, full: true, reason: "Charged twice — card terminal timed out", method: "card", requestedBy: "u4", status: "pending" });
  const ls = sales[sales.length - 1];
  refunds.push({ id: `rf${refunds.length + 1}`, at: iso(subMinutesSafe(now, 15)), target: "sale", targetId: ls.id, label: ls.no, maxAmount: ls.total, amount: Math.min(ls.total, ls.items[0].price), full: false, reason: "Item returned unopened", method: ls.method, requestedBy: "u5", status: "pending" });

  // activity seed
  const acts: [string, string, string, string][] = [
    ["u2", "Pricing", "Updated rule", "Weekend rate changed 10% → 15%"],
    ["u3", "Refunds", "Approved refund", "Rs. 1,500 on PR ticket — child unwell"],
    ["u7", "Payroll", "Paid payroll", "Payroll run marked as paid"],
    ["u2", "Users", "Deactivated user", "Pasan Kumara (cashier) deactivated"],
    ["u6", "Bookings", "Confirmed booking", "Mega Bash — full venue"],
    ["u1", "Settings", "Changed setting", "Refunds now require manager approval"],
    ["u7", "Expenses", "Recorded expense", "Electricity (CEB)"],
    ["u4", "Shifts", "Closed shift", "Shift closed with Rs. 0 variance"],
    ["u3", "Zones", "Edited zone", "Kids Play Area capacity 35 → 40"],
    ["u2", "Promotions", "Created promotion", "PLAYMORE — 30 min bonus"],
  ];
  acts.forEach(([userId, module, action, detail], i) =>
    activity.push({ id: `ac${i}`, at: iso(subMinutesSafe(now, (acts.length - i) * 600 + ri(0, 300))), userId, module, action, detail }),
  );

  // drawer counts for closed shifts (mostly balanced, a few small variances)
  shifts.forEach((sh) => {
    if (!sh.closedAt) return;
    const v = pick([0, 0, 0, 0, 0, -100, 50, -500, 20, -1000]);
    sh.countedCash = shiftSummary(sh, transactions).expected + v;
    if (v <= -500) sh.notes = "Short — checked twice, informed manager";
  });

  settings.backups = [3, 2, 1].map((b) => ({ at: iso(at(startOfDay(subDays(now, b)), 2, 0)), size: 1_800_000 + b * 21000, auto: true }));

  return {
    roles: DEFAULT_ROLES.map((x) => ({ ...x, permissions: [...x.permissions] })),
    users,
    zones,
    ratePlans,
    rules,
    promotions,
    customers,
    children,
    tickets,
    transactions,
    products,
    sales,
    packages,
    addons,
    bookings,
    shifts,
    refunds,
    expenses,
    employees,
    attendance,
    payroll,
    activity,
    settings,
    seededAt: iso(now),
  };
}

function subMinutesSafe(d: Date, m: number) {
  return new Date(d.getTime() - m * 60000);
}

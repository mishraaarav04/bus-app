import { z } from "zod";

const email = z.string().trim().toLowerCase().email().max(254);
const name = z.string().trim().min(1).max(80);
// bcrypt only uses the first 72 bytes, so cap there. Require a letter and a number.
const password = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .refine((p) => Buffer.byteLength(p) <= 72, "Password is too long.")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "Use letters and at least one number.");
const code = z.string().trim().min(4).max(32);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const geoPoint = z.object({ lat, lng });

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(200),
});

const lang = z.enum(["en", "es", "pt"]);
const acceptTerms = z.boolean().refine((v) => v === true, "Please accept the terms and privacy policy to continue.");

export const signupSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("student"), name, email, password, schoolCode: code, acceptTerms, lang: lang.optional() }),
  z.object({ role: z.literal("parent"), name, email, password, childCode: code, acceptTerms, lang: lang.optional() }),
  z.object({ role: z.literal("driver"), name, email, password, companyCode: code, acceptTerms, lang: lang.optional() }),
]);

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(200) });
export const logoutSchema = z.object({ refreshToken: z.string().min(20).max(200).optional() });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({
  email,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
  newPassword: password,
});
export const verifyEmailSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") });
export const deleteAccountSchema = z.object({ password: z.string().min(1).max(200) });

export const prefsSchema = z.object({
  lang: lang.optional(),
  notifPrefs: z
    .object({ approaching: z.boolean(), boarding: z.boolean(), delays: z.boolean() })
    .partial()
    .optional(),
});

export const pushRegisterSchema = z.object({
  token: z.string().regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, "Invalid push token."),
  platform: z.enum(["ios", "android"]),
});
export const pushUnregisterSchema = z.object({ token: z.string().min(10).max(200) });

export const childSettingsSchema = z.object({
  requiresAdultPickup: z.boolean().optional(),
  authorizedPickups: z.array(z.string().trim().min(1).max(60)).max(5).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: password,
});

export const linkChildSchema = z.object({ childCode: code });

export const busSpecSchema = z.object({
  heightM: z.number().min(2).max(5),
  widthM: z.number().min(1.5).max(3.5),
  weightT: z.number().min(1).max(40),
});

const startTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time like 07:15.");
export const scheduleSchema = z.object({ startTime: startTime.nullable() });

export const createSchoolSchema = z.object({
  name,
  email,
  password,
  address: z.string().trim().min(3).max(200),
  location: geoPoint,
});

export const createRouteSchema = z.object({
  name,
  schoolId: z.string().uuid(),
  direction: z.enum(["to_school", "to_home"]),
  vehicle: busSpecSchema.optional(),
  startTime: startTime.optional(),
  // Max 11: the Mapbox Optimization API takes 12 points and one is the school.
  stops: z
    .array(z.object({ name: z.string().trim().min(1).max(120), location: geoPoint }))
    .min(1)
    .max(11),
});

export const assignDriverSchema = z.object({ driverId: z.string().uuid().nullable() });

export const assignStudentSchema = z.object({
  routeId: z.string().uuid(),
  studentId: z.string().uuid(),
  stopId: z.string().uuid().nullable(), // null = remove from this route
});

export const startRideSchema = z.object({ routeId: z.string().uuid() });
export const locationSchema = geoPoint;
export const notRidingSchema = z.object({ studentId: z.string().uuid() });
export const departSchema = z.object({ stopId: z.string().uuid() });

export const checkinSchema = z
  .object({
    token: z.string().min(10).max(2000).optional(),
    tagId: z.string().min(1).max(64).optional(),
    // Manual check-in by the driver for a student without a phone or card.
    studentId: z.string().uuid().optional(),
    // Set by the app so a retried or offline-queued scan is counted once.
    scanId: z.string().min(8).max(64).optional(),
    scannedAt: z.string().datetime().optional(),
  })
  .refine((v) => v.token || v.tagId || v.studentId, "token, tagId or studentId required");

export const geoSearchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const incidentSchema = z.object({
  type: z.enum(["delay", "breakdown", "accident", "other"]),
  delayMinutes: z.number().int().min(1).max(180).optional(),
  note: z.string().trim().max(200).optional(),
});
export const dropoffSchema = z.object({
  studentId: z.string().uuid(),
  handedTo: z.string().trim().min(1).max(60).optional(),
});
export const endRideSchema = z.object({ force: z.boolean().optional() });

export const absenceSchema = z.object({
  studentId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["to_school", "to_home", "both"]),
});

export const rosterSchema = z.object({
  csv: z.string().min(1).max(600_000),
  sendInvites: z.boolean().optional(),
});

export const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  routeId: z.string().uuid().optional(),
});

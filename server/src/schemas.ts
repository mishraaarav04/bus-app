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

export const signupSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("student"), name, email, password, schoolCode: code }),
  z.object({ role: z.literal("parent"), name, email, password, childCode: code }),
  z.object({ role: z.literal("driver"), name, email, password, companyCode: code }),
]);

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
  })
  .refine((v) => v.token || v.tagId, "token or tagId required");

export const geoSearchSchema = z.object({
  q: z.string().trim().min(2).max(200),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export const createConversationSchema = z.object({
  kind: z.enum(["parent_group", "parent_driver", "admin_broadcast", "driver_admin"]),
  routeId: z.string().uuid().optional(),
  participantIds: z.array(z.string().uuid()).max(100),
});

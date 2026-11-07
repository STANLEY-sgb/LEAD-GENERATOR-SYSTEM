import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const registerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(100),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(10, "Use at least 10 characters").max(128),
});

export const forgotSchema = z.object({ email: z.string().email("Enter a valid email") });

export const onboardingSchema = z.object({
  name: z.string().min(2, "Organization name is required").max(120),
});

export function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "org";
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}

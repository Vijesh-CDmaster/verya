import { z } from "zod";

export const LeadSchema = z.object({
  name: z.string().min(1, "Please fill in your name.").max(120),
  email: z.string().min(1, "Please fill in your email.").email("Please enter a valid email address.").max(200),
  phone: z.string().max(40).optional(),
  source: z.string().max(80).optional(),
  // F49: explicit consent — the form cannot be submitted without accepting.
  acceptTerms: z.literal(true, { message: "Please accept the Terms of Service and Privacy Policy." }),
});

export type LeadInput = z.infer<typeof LeadSchema>;

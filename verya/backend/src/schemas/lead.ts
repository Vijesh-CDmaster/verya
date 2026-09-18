import { z } from "zod";

export const LeadCreateSchema = z.object({
  name: z.string().min(1, "Please fill in your name.").max(120),
  email: z.string().min(1, "Please fill in your email.").email("Please enter a valid email address.").max(200),
  phone: z.string().max(40).optional(),
  source: z.string().max(80).optional(),
  // F49: consent is mandatory; recorded as accepted_terms_at in the leads table.
  acceptTerms: z.literal(true, { message: "Terms acceptance is required." }),
});

export type LeadCreate = z.infer<typeof LeadCreateSchema>;

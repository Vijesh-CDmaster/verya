import { z } from "zod";

export const LeadSchema = z.object({
  name: z.string().min(1, "Please fill in your name.").max(120),
  email: z.string().min(1, "Please fill in your email.").email("Please enter a valid email address.").max(200),
  phone: z.string().max(40).optional(),
});

export type LeadInput = z.infer<typeof LeadSchema>;

import { z } from "zod";
import { optionalPhone, requiredEmail } from "@/shared/validation/fields";

export const profileSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  email: requiredEmail,
  phone: optionalPhone,
  role: z.string().optional().default(""),
  /* 24 é o mesmo teto do CHECK da migração 059. É assinatura, não biografia:
     o campo aparece no rodapé da nota e antes de cada mensagem de WhatsApp. */
  nomeExibicao: z.string().max(24, "Máximo de 24 caracteres").optional().default(""),
});

export type ProfileInput = z.input<typeof profileSchema>;
export type ProfileData = z.output<typeof profileSchema>;

export const passwordSchema = z
  .object({
    current: z.string().min(1, "Informe a senha atual"),
    next: z.string().min(6, "Mínimo de 6 caracteres"),
    confirm: z.string().min(1, "Confirme a nova senha"),
  })
  .refine((d) => d.next === d.confirm, {
    path: ["confirm"],
    message: "As senhas não coincidem",
  });

export type PasswordData = z.infer<typeof passwordSchema>;

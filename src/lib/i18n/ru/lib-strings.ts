// Russian: strings produced in src/lib (labels, statuses, role names, error and toast messages) and shown by
// components through t(value). Keys are the exact English source text. Glossary and rules: docs/i18n.md.
import type { Dictionary } from "../types";

const libStrings: Dictionary = {
  // Roles (ROLE_INFO in src/lib/teamLogic.ts; shown by RoleBadge and AccountMenu)
  Owner: "Владелец",
  "Office / admin": "Офис / администратор",
  Admin: "Офис",
  Technician: "Монтажник",
  Tech: "Монтажник",

  // Password strength (passwordStrength in src/lib/onboardingLogic.ts; shown by PasswordField)
  "Too short": "Слишком короткий",
  Weak: "Слабый",
  Fair: "Средний",
  Good: "Хороший",
  Strong: "Надёжный",
  "That one is easy to guess. Try a short phrase.": "Такой легко угадать. Попробуйте короткую фразу.",
  "Longer is stronger — add a word or two.": "Чем длиннее, тем надёжнее — добавьте слово-другое.",
  "Good. A few more characters make it strong.": "Хорошо. Ещё несколько символов — и он станет надёжным.",
  "Strong password.": "Надёжный пароль.",
};

export default libStrings;

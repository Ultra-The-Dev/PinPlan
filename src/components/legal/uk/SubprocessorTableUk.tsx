// The subprocessor table in Ukrainian (translation for convenience; /privacy and /legal/subprocessors in English govern).
// Rows come from SUBPROCESSORS in src/lib/legal.ts; a provider without a Ukrainian description here shows its English text.
import { Ph } from "@/components/legal/LegalDoc";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

const UK: Record<string, { purpose: string; data: string }> = {
  "Supabase, Inc.": {
    purpose: "База даних, автентифікація користувачів і зберігання файлів",
    data: "Дані акаунта та всі синхронізовані Дані Замовника (об’єкти, плани, фото, кошториси, рахунки, записи польових робіт і файли)",
  },
  "Cloudflare, Inc.": {
    purpose: "Хостинг сайту та застосунку, серверні функції, доставка контенту, DNS і пересилання пошти",
    data: "Запити, що проходять через сервіс, IP-адреси, серверні журнали",
  },
  "Stripe, Inc.": {
    purpose: "Оплата підписки та обробка платежів",
    data: "Платіжний контакт, назва компанії, дані платіжної картки (зберігаються у Stripe, а не в нас), рахунки",
  },
  "Resend (Plus Five Five, Inc.)": {
    purpose: "Службові листи (посилання для входу, запрошення, сповіщення про кошториси та оплату)",
    data: "Адреса електронної пошти та ім’я одержувача, зміст листа",
  },
  "Anthropic, PBC": {
    purpose: "Функції ШІ: читання планів поверхів, пропозиції пристроїв, підписи до фото та чернетки щоденних журналів",
    data: "Зображення аркушів плану, фото з об’єктів і пов’язаний текст, які ви вирішуєте надіслати у функцію ШІ",
  },
  "Apple Inc.": {
    purpose: "Розповсюдження застосунку для iOS через App Store (і вбудовані покупки, якщо вони є)",
    data: "Відомості, які Apple збирає на власних умовах, коли ви завантажуєте або купуєте через App Store",
  },
};

const LOCATION_UK: Record<string, string> = {
  "United States": "США",
  "United States (global edge network)": "США (глобальна мережа периферійних вузлів)",
};

export default function SubprocessorTableUk() {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Постачальник</th>
            <th>Призначення</th>
            <th>Які дані</th>
            <th>Місцезнаходження</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td className="font-medium whitespace-nowrap">{s.name}</td>
              <td>{UK[s.name]?.purpose ?? s.purpose}</td>
              <td>{UK[s.name]?.data ?? s.data}</td>
              <td>
                <Ph>{s.location === COMPANY.dataRegion ? s.location : (LOCATION_UK[s.location] ?? s.location)}</Ph>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

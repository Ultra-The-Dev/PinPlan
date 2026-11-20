// The subprocessor table in Russian (translation for convenience; /privacy and /legal/subprocessors in English govern).
// Rows come from SUBPROCESSORS in src/lib/legal.ts; a provider without a Russian description here shows its English text.
import { Ph } from "@/components/legal/LegalDoc";
import { COMPANY, SUBPROCESSORS } from "@/lib/legal";

const RU: Record<string, { purpose: string; data: string }> = {
  "Supabase, Inc.": {
    purpose: "База данных, аутентификация пользователей и хранение файлов",
    data: "Данные аккаунта и все синхронизированные Данные Заказчика (объекты, планы, фото, сметы, счета, записи с объектов и файлы)",
  },
  "Cloudflare, Inc.": {
    purpose: "Хостинг сайта и приложения, серверные функции, доставка контента, DNS и пересылка почты",
    data: "Запросы, проходящие через сервис, IP-адреса, серверные журналы",
  },
  "Stripe, Inc.": {
    purpose: "Оплата подписки и обработка платежей",
    data: "Платёжный контакт, название компании, данные платёжной карты (хранятся у Stripe, а не у нас), счета",
  },
  "Resend (Plus Five Five, Inc.)": {
    purpose: "Служебные письма (ссылки для входа, приглашения, уведомления о сметах и оплате)",
    data: "Адрес электронной почты и имя получателя, содержание письма",
  },
  "Anthropic, PBC": {
    purpose: "Функции ИИ: чтение планов этажей, предложения устройств, подписи к фото и черновики ежедневных отчётов",
    data: "Изображения листов плана, фото с объектов и связанный текст, которые вы решаете отправить в функцию ИИ",
  },
  "Apple Inc.": {
    purpose: "Распространение приложения для iOS через App Store (и встроенные покупки, если они есть)",
    data: "Сведения, которые Apple собирает на своих условиях, когда вы скачиваете или покупаете через App Store",
  },
};

const LOCATION_RU: Record<string, string> = {
  "United States": "США",
  "United States (global edge network)": "США (глобальная сеть периферийных узлов)",
};

export default function SubprocessorTableRu() {
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Поставщик</th>
            <th>Назначение</th>
            <th>Какие данные</th>
            <th>Местонахождение</th>
          </tr>
        </thead>
        <tbody>
          {SUBPROCESSORS.map((s) => (
            <tr key={s.name}>
              <td className="font-medium whitespace-nowrap">{s.name}</td>
              <td>{RU[s.name]?.purpose ?? s.purpose}</td>
              <td>{RU[s.name]?.data ?? s.data}</td>
              <td>
                <Ph>{s.location === COMPANY.dataRegion ? s.location : (LOCATION_RU[s.location] ?? s.location)}</Ph>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

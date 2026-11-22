// Ukrainian version of /support. The English page (src/app/support/page.tsx) governs where the account-deletion and
// data-export wording matters; keep the sections, ids, steps and conditions (AI_ENABLED) in step with it. Menu names
// follow the app's Ukrainian dictionary (docs/i18n.md).
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import StatusCheck from "@/components/legal/StatusCheck";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  contact: { id: "contact", title: "Зв’язатися з нами" },
  status: { id: "status", title: "Стан сервісу" },
  faq: { id: "faq", title: "Поширені запитання" },
  export: { id: "export", title: "Експорт даних" },
  deleteAccount: { id: "delete-account", title: "Видалення акаунта" },
  security: { id: "security", title: "Повідомити про проблему безпеки" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

const FAQ: { q: string; a: React.ReactNode; onlyWhen?: "ai" }[] = [
  {
    q: "Чи працює Northpin без зв’язку?",
    a: "Так. Об’єкти, плани та фото спочатку зберігаються на вашому пристрої, тому можна й далі розставляти пристрої та фотографувати без з’єднання. Коли зв’язок повернеться, зміни автоматично синхронізуються з командою. Значок хмари в заголовку показує все, що ще чекає на вивантаження.",
  },
  {
    q: "Де зберігаються мої дані?",
    a: (
      <>
        На вашому пристрої та — коли ви ввійшли в акаунт — у нашій хмарній базі даних і файловому сховищі Supabase в регіоні <Ph>{COMPANY.dataRegion}</Ph>, у
        зашифрованому вигляді під час передавання та зберігання. Повний перелік постачальників наведено в <Link href="/privacy">Політиці конфіденційності</Link>.
      </>
    ),
  },
  {
    q: "Чи використовуються мої дані для навчання ШІ?",
    a: "Ні. Функції ШІ (читання планів, пропозиції пристроїв, підписи до фото, чернетки щоденних журналів) працюють лише тоді, коли ви ними користуєтеся. Відповідні зображення та текст обробляє Anthropic на своїх комерційних умовах, які не дозволяють навчання на цих даних. Пропозиції ШІ не враховуються в підрахунку та цінах, доки хтось їх не прийме.",
    onlyWhen: "ai",
  },
  {
    q: "Як додати офісних працівників і техніків?",
    a: "Відкрийте «Налаштування → Команда» та запросіть їх. Техніки працюють із планами, фото, чек-листами та завданнями; у їхніх акаунтах ціни, кошториси й рахунки в застосунку приховано. Кожен отримує власний вхід.",
  },
  {
    q: "Як змінити або скасувати підписку?",
    a: (
      <>
        Власники команди можуть змінити тариф або скасувати підписку в розділі «Налаштування → Тариф і оплата»; скасування набирає чинності наприкінці поточного
        періоду. Якщо ви оформили підписку через App Store, керуйте нею в налаштуваннях iOS → ваше ім’я → «Підписки». Тарифи — на сторінці{" "}
        <Link href="/pricing">«Ціни»</Link>.
      </>
    ),
  },
  {
    q: "На фото неправильне місце або його немає зовсім.",
    a: "Northpin бере GPS-координати, які камера зберегла у фото. Переконайтеся, що застосунку камери (і Northpin, якщо фотографуєте в застосунку) дозволено доступ до геопозиції. Деякі месенджери видаляють геодані з надісланих фото.",
  },
  {
    q: "Не вдається ввійти або не прийшов лист.",
    a: (
      <>
        Пошукайте лист від Northpin у папці «Спам» і переконайтеся, що ви використовуєте ту саму адресу, на яку вас запросила команда. Не допомогло? Напишіть на{" "}
        <Ph>{COMPANY.supportEmail}</Ph> з цієї адреси, і ми допоможемо.
      </>
    ),
  },
  {
    q: "У застосунку щось пішло не так.",
    a: "Перезавантажте сторінку або знову відкрийте застосунок — вашу роботу збережено на пристрої. Якщо з’явився екран помилки, натисніть «Скопіювати подробиці» та вставте їх у лист до підтримки, щоб ми швидко знайшли проблему.",
  },
];

export const supportUk: LegalTranslation = {
  title: "Підтримка",
  toc,
  intro: (
    <p>
      Ми невелика команда й створюємо Northpin для підрядників з електромонтажу, слабкострумових та інших спеціалізованих систем. На кожен лист відповідають живі
      люди.
    </p>
  ),
  children: (
    <>
      <Section item={S.contact}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Підтримка електронною поштою</p>
            <p className="mt-1">
              <Ph>{COMPANY.supportEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Відповідаємо протягом одного робочого дня (за часом США, <Ph>{COMPANY.supportTimeZone}</Ph>). Вкажіть назву компанії, а якщо щось не працює — що ви
              робили, і додайте знімок екрана або скопійовані подробиці помилки.
            </p>
          </div>
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Конфіденційність і запити щодо даних</p>
            <p className="mt-1">
              <Ph>{COMPANY.privacyEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Для запитів на доступ, експорт або видалення. Надсилайте їх з електронної пошти свого акаунта, щоб ми могли їх перевірити.
            </p>
          </div>
        </div>
        <p>Ніколи не надсилайте електронною поштою паролі, ключі API чи номери платіжних карток. Ми ніколи їх не попросимо.</p>
      </Section>

      <Section item={S.status}>
        <div className="mk-sheet mt-4 p-5">
          <StatusCheck />
          <p className="mt-3 text-sm text-mk-pencil">
            Перевірка наших серверів і бази даних у реальному часі: <a href="/api/health">/api/health</a>
          </p>
        </div>
      </Section>

      <Section item={S.faq}>
        <div className="mt-4 divide-y divide-mk-rule mk-sheet">
          {FAQ.filter((f) => f.onlyWhen !== "ai" || AI_ENABLED).map((f) => (
            <details key={f.q} className="group px-5 [&_p]:-mt-2 [&_p]:pb-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium text-mk-graphite [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-slate-400 transition group-open:rotate-45" aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-mk-pencil">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section item={S.export}>
        <p>
          Ваші об’єкти належать вам. Ви можете вивантажити їх будь-коли, зокрема після закінчення підписки (акаунт залишається доступним для читання).
        </p>
        <ul>
          <li>
            <strong>Об’єкт повністю, з планами, позначками, фото та цінами:</strong> відкрийте об’єкт → вкладка <strong>«Огляд»</strong> →{" "}
            <strong>«Резервна копія»</strong> → <strong>«Завантажити резервну копію»</strong>. Збережеться один файл, який Northpin може відновити на будь-якому
            пристрої («Об’єкти» → <strong>«Відновити з копії»</strong>).
          </li>
          <li>
            <strong>Підрахунок, ціни та звіти:</strong> завантажуйте PDF і CSV на вкладках об’єкта <strong>«Підрахунок»</strong>, <strong>«Фінанси»</strong>{" "}
            (розділ «Ціни»), <strong>«План»</strong> і <strong>«Польові роботи»</strong>.
          </li>
          <li>
            <strong>Ваш прайс-лист:</strong> <strong>«Прайс-лист»</strong> → завантажте CSV.
          </li>
          <li>
            <strong>Усе одразу:</strong> напишіть на <Ph>{COMPANY.supportEmail}</Ph> з адреси власника команди, і ми надішлемо повний експорт даних вашого акаунта
            протягом {RETENTION.deletionRequestDays} днів.
          </li>
        </ul>
      </Section>

      <Section item={S.deleteAccount}>
        <p>Ви можете видалити свій акаунт самостійно:</p>
        <ol>
          <li>
            У вебзастосунку або застосунку для iOS відкрийте <strong>«Налаштування → Акаунт»</strong>.
          </li>
          <li>
            Виберіть <strong>«Видалити акаунт»</strong> і підтвердьте.
          </li>
        </ol>
        <p>Що відбудеться далі:</p>
        <ul>
          <li>Ваш вхід видаляється негайно, і ви виходите з акаунта на всіх пристроях.</li>
          <li>
            Якщо ви <strong>власник команди</strong>, разом з акаунтом видаляються також об’єкти, фото та документи команди. Якщо компанія й надалі користуватиметься
            Northpin, спочатку передайте права власника («Налаштування → Команда») і скасуйте підписку App Store в налаштуваннях iOS.
          </li>
          <li>Якщо ви учасник команди, ваші об’єкти залишаються в команди; видаляються лише ваш вхід і особисті дані.</li>
          <li>
            Ваші дані одразу видаляються з нашої робочої бази даних і файлового сховища, а з резервних копій — у міру спливання їхнього строку зберігання, як описано
            в <Link href="/privacy#retention">Політиці конфіденційності</Link>. Копії, збережені на ваших власних пристроях, залишаються, доки ви не видалите
            застосунок або його дані.
          </li>
        </ul>
        <p>
          Не вдається ввійти? Напишіть на <Ph>{COMPANY.privacyEmail}</Ph> з електронної пошти свого акаунта з темою «Delete my account» («Видалити мій акаунт»), і
          ми зробимо це за вас, переконавшись, що це ви, протягом {RETENTION.deletionRequestDays} днів після вашого листа.
        </p>
      </Section>

      <Section item={S.security}>
        <p>
          Якщо ви вважаєте, що знайшли вразливість, надішліть подробиці на <Ph>{COMPANY.securityEmail}</Ph>. Будь ласка, дайте нам розумний час на її усунення,
          перш ніж розголошувати її, і під час перевірки не звертайтеся до даних інших замовників і не порушуйте роботу Сервісу. Ми цінуємо відповідальні
          повідомлення.
        </p>
      </Section>
    </>
  ),
};

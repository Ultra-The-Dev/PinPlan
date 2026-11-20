// Russian version of /support. The English page (src/app/support/page.tsx) governs where the account-deletion and
// data-export wording matters; keep the sections, ids, steps and conditions (AI_ENABLED) in step with it. Menu names
// follow the app's Russian dictionary (docs/i18n.md).
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import StatusCheck from "@/components/legal/StatusCheck";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  contact: { id: "contact", title: "Связаться с нами" },
  status: { id: "status", title: "Состояние сервиса" },
  faq: { id: "faq", title: "Частые вопросы" },
  export: { id: "export", title: "Экспорт данных" },
  deleteAccount: { id: "delete-account", title: "Удаление аккаунта" },
  security: { id: "security", title: "Сообщить о проблеме безопасности" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

const FAQ: { q: string; a: React.ReactNode; onlyWhen?: "ai" }[] = [
  {
    q: "PinPlan работает без связи?",
    a: "Да. Объекты, планы и фото сначала сохраняются на устройстве, поэтому можно расставлять устройства и снимать фото без связи. Когда связь вернётся, изменения автоматически синхронизируются с командой. Значок облака в шапке показывает всё, что ещё ждёт загрузки.",
  },
  {
    q: "Где хранятся мои данные?",
    a: (
      <>
        На вашем устройстве и — когда вы вошли в аккаунт — в нашей облачной базе данных и файловом хранилище Supabase в регионе <Ph>{COMPANY.dataRegion}</Ph>, в
        зашифрованном виде при передаче и хранении. Полный список поставщиков — в <Link href="/privacy">Политике конфиденциальности</Link>.
      </>
    ),
  },
  {
    q: "Используются ли мои данные для обучения ИИ?",
    a: "Нет. Функции ИИ (чтение планов, предложения устройств, подписи к фото, черновики ежедневных отчётов) работают, только когда вы ими пользуетесь. Нужные изображения и текст обрабатывает Anthropic на своих коммерческих условиях, которые не допускают обучения на этих данных. Предложения ИИ не учитываются в подсчёте и ценах, пока их кто-нибудь не примет.",
    onlyWhen: "ai",
  },
  {
    q: "Как добавить офисных сотрудников и монтажников?",
    a: "Откройте «Настройки → Команда» и пригласите их. Монтажники работают с планами, фото, чек-листами и задачами; в их аккаунтах цены, сметы и счета в приложении скрыты. У каждого свой вход.",
  },
  {
    q: "Как сменить или отменить подписку?",
    a: (
      <>
        Владельцы команды могут сменить тариф или отменить подписку в разделе «Настройки → Тариф и оплата»; отмена вступает в силу в конце текущего периода. Если вы
        оформили подписку через App Store, управляйте ею в настройках iOS → ваше имя → «Подписки». Тарифы — на странице <Link href="/pricing">«Цены»</Link>.
      </>
    ),
  },
  {
    q: "На фото неверное место или его нет совсем.",
    a: "PinPlan берёт GPS-координаты, которые камера сохранила в фото. Проверьте, что приложению камеры (и PinPlan, если снимаете в приложении) разрешён доступ к геопозиции. Некоторые мессенджеры удаляют геоданные из пересылаемых фото.",
  },
  {
    q: "Не получается войти или не пришло письмо.",
    a: (
      <>
        Поищите письмо от PinPlan в папке «Спам» и проверьте, что вы используете тот же адрес, на который вас пригласила команда. Не помогло? Напишите на{" "}
        <Ph>{COMPANY.supportEmail}</Ph> с этого адреса, и мы поможем.
      </>
    ),
  },
  {
    q: "В приложении что-то пошло не так.",
    a: "Перезагрузите страницу или откройте приложение заново — ваша работа сохранена на устройстве. Если появился экран ошибки, нажмите «Скопировать подробности» и вставьте их в письмо в поддержку, чтобы мы быстро нашли проблему.",
  },
];

export const supportRu: LegalTranslation = {
  title: "Поддержка",
  toc,
  intro: <p>Мы небольшая команда и делаем PinPlan для подрядчиков по электрике, слаботочным и другим специализированным системам. На каждое письмо отвечают живые люди.</p>,
  children: (
    <>
      <Section item={S.contact}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Поддержка по почте</p>
            <p className="mt-1">
              <Ph>{COMPANY.supportEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Отвечаем в течение одного рабочего дня (по времени США, <Ph>{COMPANY.supportTimeZone}</Ph>). Укажите название компании, а если что-то не работает —
              что вы делали, и приложите снимок экрана или скопированные подробности ошибки.
            </p>
          </div>
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Конфиденциальность и запросы данных</p>
            <p className="mt-1">
              <Ph>{COMPANY.privacyEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">Для запросов на доступ, экспорт или удаление. Отправляйте их с почты аккаунта, чтобы мы могли их проверить.</p>
          </div>
        </div>
        <p>Никогда не присылайте по почте пароли, ключи API или номера платёжных карт. Мы никогда их не попросим.</p>
      </Section>

      <Section item={S.status}>
        <div className="mk-sheet mt-4 p-5">
          <StatusCheck />
          <p className="mt-3 text-sm text-mk-pencil">
            Проверка наших серверов и базы данных в реальном времени: <a href="/api/health">/api/health</a>
          </p>
        </div>
      </Section>

      <Section item={S.faq}>
        <div className="mt-4 divide-y divide-mk-rule mk-sheet">
          {FAQ.filter((f) => f.onlyWhen !== "ai" || AI_ENABLED).map((f) => (
            <details key={f.q} className="group px-5 py-4 [&_p]:mt-2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-mk-graphite [&::-webkit-details-marker]:hidden">
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
        <p>Ваши объекты принадлежат вам. Вы можете выгрузить их в любое время, в том числе после окончания подписки (аккаунт остаётся доступным для чтения).</p>
        <ul>
          <li>
            <strong>Объект целиком, с планами, пометками, фото и ценами:</strong> откройте объект → вкладка <strong>«Обзор»</strong> →{" "}
            <strong>«Резервная копия»</strong> → <strong>«Скачать резервную копию»</strong>. Сохранится один файл, который PinPlan может восстановить на любом
            устройстве («Объекты» → <strong>«Восстановить из копии»</strong>).
          </li>
          <li>
            <strong>Подсчёт, цены и отчёты:</strong> скачивайте PDF и CSV на вкладках объекта <strong>«Подсчёт»</strong>, <strong>«Финансы»</strong> (раздел
            «Расчёт цен»), <strong>«План»</strong> и <strong>«На объекте»</strong>.
          </li>
          <li>
            <strong>Ваш прайс-лист:</strong> <strong>«Прайс-лист»</strong> → скачать CSV.
          </li>
          <li>
            <strong>Всё сразу:</strong> напишите на <Ph>{COMPANY.supportEmail}</Ph> с адреса владельца команды, и мы пришлём полный экспорт данных вашего аккаунта в
            течение {RETENTION.deletionRequestDays} дней.
          </li>
        </ul>
      </Section>

      <Section item={S.deleteAccount}>
        <p>Удалить аккаунт можно самостоятельно:</p>
        <ol>
          <li>
            В веб-приложении или приложении для iOS откройте <strong>«Настройки → Аккаунт»</strong>.
          </li>
          <li>
            Выберите <strong>«Удалить аккаунт»</strong> и подтвердите.
          </li>
        </ol>
        <p>Что произойдёт дальше:</p>
        <ul>
          <li>Ваш вход удаляется сразу, и вы выходите из аккаунта на всех устройствах.</li>
          <li>
            Если вы <strong>владелец команды</strong>, вместе с аккаунтом удаляются объекты, фото и документы команды. Если компания продолжит пользоваться PinPlan,
            сначала передайте права владельца («Настройки → Команда») и отмените подписку App Store в настройках iOS.
          </li>
          <li>Если вы участник команды, ваши объекты остаются у команды; удаляются только ваш вход и личные данные.</li>
          <li>
            Ваши данные сразу удаляются из нашей рабочей базы данных и файлового хранилища, а из резервных копий — по мере истечения их срока, как описано в{" "}
            <Link href="/privacy#retention">Политике конфиденциальности</Link>. Копии на ваших устройствах остаются, пока вы не удалите приложение или его данные.
          </li>
        </ul>
        <p>
          Не получается войти? Напишите на <Ph>{COMPANY.privacyEmail}</Ph> с почты аккаунта с темой «Delete my account» («Удалить мой аккаунт»), и мы сделаем это
          за вас, убедившись, что это вы, в течение {RETENTION.deletionRequestDays} дней после письма.
        </p>
      </Section>

      <Section item={S.security}>
        <p>
          Если вы считаете, что нашли уязвимость, напишите подробности на <Ph>{COMPANY.securityEmail}</Ph>. Пожалуйста, дайте нам разумное время на исправление,
          прежде чем раскрывать её, и во время проверки не обращайтесь к данным других заказчиков и не нарушайте работу Сервиса. Мы ценим ответственные сообщения.
        </p>
      </Section>
    </>
  ),
};

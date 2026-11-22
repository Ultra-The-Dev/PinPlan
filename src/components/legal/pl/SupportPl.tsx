// Polish version of /support. The English page (src/app/support/page.tsx) governs where the account-deletion and
// data-export wording matters; keep the sections, ids, steps and conditions (AI_ENABLED) in step with it. Menu names
// follow the app's Polish dictionary (docs/i18n.md).
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import StatusCheck from "@/components/legal/StatusCheck";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  contact: { id: "contact", title: "Kontakt" },
  status: { id: "status", title: "Stan usługi" },
  faq: { id: "faq", title: "Najczęściej zadawane pytania" },
  export: { id: "export", title: "Eksport danych" },
  deleteAccount: { id: "delete-account", title: "Usuwanie konta" },
  security: { id: "security", title: "Zgłoś problem z bezpieczeństwem" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);

const FAQ: { q: string; a: React.ReactNode; onlyWhen?: "ai" }[] = [
  {
    q: "Czy Northpin działa bez zasięgu?",
    a: "Tak. Zlecenia, plany i zdjęcia są najpierw zapisywane na Twoim urządzeniu, więc możesz dalej umieszczać urządzenia na planie i robić zdjęcia bez połączenia. Gdy znów będziesz online, zmiany automatycznie zsynchronizują się z Twoim zespołem. Ikona chmury w nagłówku pokazuje wszystko, co jeszcze czeka na przesłanie.",
  },
  {
    q: "Gdzie są przechowywane moje dane?",
    a: (
      <>
        Na Twoim urządzeniu oraz — gdy jesteś zalogowany(-a) — w naszej chmurowej bazie danych i magazynie plików hostowanych przez Supabase w regionie{" "}
        <Ph>{COMPANY.dataRegion}</Ph>, zaszyfrowane podczas przesyłania i przechowywania. Pełną listę dostawców znajdziesz w{" "}
        <Link href="/privacy">Polityce prywatności</Link>.
      </>
    ),
  },
  {
    q: "Czy moje dane są używane do trenowania AI?",
    a: "Nie. Funkcje AI (odczytywanie planów, sugestie urządzeń, podpisy zdjęć, wersje robocze dziennika budowy) działają tylko wtedy, gdy z nich korzystasz. Potrzebne obrazy i tekst przetwarza Anthropic na swoich warunkach komercyjnych, które nie pozwalają na trenowanie na tych danych. Sugestie AI nigdy nie są uwzględniane w przedmiarze ani w cenach, dopóki ktoś ich nie zaakceptuje.",
    onlyWhen: "ai",
  },
  {
    q: "Jak dodać pracowników biura i techników?",
    a: "Otwórz Ustawienia → Zespół i zaproś ich. Technicy mogą pracować na planach, zdjęciach, listach kontrolnych i zadaniach; na ich kontach ceny, wyceny i faktury są w aplikacji ukryte. Każda osoba ma własny login.",
  },
  {
    q: "Jak zmienić lub anulować subskrypcję?",
    a: (
      <>
        Właściciele zespołu mogą zmienić plan lub anulować subskrypcję w sekcji Ustawienia → Plan i płatności; anulowanie wchodzi w życie z końcem bieżącego okresu.
        Jeśli subskrypcja została wykupiona przez App Store, zarządzaj nią w Ustawieniach iOS → Twoje imię i nazwisko → Subskrypcje. Plany znajdziesz na stronie{" "}
        <Link href="/pricing">Cennik</Link>.
      </>
    ),
  },
  {
    q: "Zdjęcie pokazuje złą lokalizację albo nie pokazuje jej wcale.",
    a: "Northpin odczytuje pozycję GPS zapisaną w zdjęciu przez aparat. Upewnij się, że aplikacja aparatu (oraz Northpin, gdy robisz zdjęcia w aplikacji) ma dostęp do lokalizacji. Zdjęcia wysyłane przez niektóre komunikatory mają usuwaną lokalizację.",
  },
  {
    q: "Nie mogę się zalogować albo nie dostałem(-am) wiadomości e-mail.",
    a: (
      <>
        Sprawdź, czy w folderze spamu nie ma wiadomości od Northpin, i upewnij się, że używasz tego samego adresu e-mail, na który zaprosił Cię zespół. Nadal nie
        działa? Napisz na adres <Ph>{COMPANY.supportEmail}</Ph> z tego adresu, a pomożemy.
      </>
    ),
  },
  {
    q: "Coś poszło nie tak w aplikacji.",
    a: "Odśwież stronę lub otwórz aplikację ponownie — Twoja praca jest zapisana na urządzeniu. Jeśli pojawi się ekran błędu, stuknij „Kopiuj szczegóły” i wklej je do wiadomości e-mail do pomocy technicznej, abyśmy mogli szybko znaleźć problem.",
  },
];

export const supportPl: LegalTranslation = {
  title: "Pomoc",
  toc,
  intro: (
    <p>
      Jesteśmy małym zespołem, który tworzy Northpin dla wykonawców instalacji elektrycznych, niskoprądowych i specjalistycznych. Na każdą wiadomość odpowiadają
      prawdziwi ludzie.
    </p>
  ),
  children: (
    <>
      <Section item={S.contact}>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Pomoc przez e-mail</p>
            <p className="mt-1">
              <Ph>{COMPANY.supportEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              Odpowiadamy w ciągu jednego dnia roboczego (w godzinach pracy w USA, <Ph>{COMPANY.supportTimeZone}</Ph>). Podaj nazwę firmy, a w przypadku problemu —
              co robiłeś(-aś) oraz zrzut ekranu lub skopiowane szczegóły błędu.
            </p>
          </div>
          <div className="mk-sheet p-5">
            <p className="font-semibold text-mk-graphite">Prywatność i wnioski dotyczące danych</p>
            <p className="mt-1">
              <Ph>{COMPANY.privacyEmail}</Ph>
            </p>
            <p className="mt-2 text-sm text-mk-pencil">
              W sprawie wniosków o dostęp, eksport lub usunięcie danych. Wysyłaj je z adresu e-mail swojego konta, abyśmy mogli je zweryfikować.
            </p>
          </div>
        </div>
        <p>Nigdy nie wysyłaj e-mailem haseł, kluczy API ani numerów kart płatniczych. Nigdy o nie nie poprosimy.</p>
      </Section>

      <Section item={S.status}>
        <div className="mk-sheet mt-4 p-5">
          <StatusCheck />
          <p className="mt-3 text-sm text-mk-pencil">
            Bieżące sprawdzenie naszych serwerów i bazy danych: <a href="/api/health">/api/health</a>
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
        <p>Twoje zlecenia należą do Ciebie. Możesz je wyeksportować w dowolnym momencie, także po zakończeniu subskrypcji (konto pozostaje dostępne do odczytu).</p>
        <ul>
          <li>
            <strong>Całe zlecenie, z planami, adnotacjami, zdjęciami i cenami:</strong> otwórz zlecenie → karta <strong>Przegląd</strong> →{" "}
            <strong>Kopia zapasowa</strong> → <strong>Pobierz kopię zapasową</strong>. Zapisuje to jeden plik, który Northpin może przywrócić na dowolnym urządzeniu
            (Zlecenia → <strong>Przywróć kopię</strong>).
          </li>
          <li>
            <strong>Przedmiar, ceny i raporty:</strong> pobieraj pliki PDF i CSV z kart zlecenia <strong>Przedmiar</strong>, <strong>Finanse</strong> (sekcja
            Cennik), <strong>Plan</strong> i <strong>Teren</strong>.
          </li>
          <li>
            <strong>Twój cennik:</strong> <strong>Cennik</strong> → pobierz plik CSV.
          </li>
          <li>
            <strong>Wszystko naraz:</strong> napisz na adres <Ph>{COMPANY.supportEmail}</Ph> z adresu właściciela zespołu, a w ciągu{" "}
            {RETENTION.deletionRequestDays} dni prześlemy pełny eksport danych Twojego konta.
          </li>
        </ul>
      </Section>

      <Section item={S.deleteAccount}>
        <p>Możesz samodzielnie usunąć swoje konto:</p>
        <ol>
          <li>
            W aplikacji internetowej lub aplikacji na iOS otwórz <strong>Ustawienia → Konto</strong>.
          </li>
          <li>
            Wybierz <strong>Usuń konto</strong> i potwierdź.
          </li>
        </ol>
        <p>Co dzieje się dalej:</p>
        <ul>
          <li>Twój login zostaje natychmiast usunięty, a Ty zostajesz wylogowany(-a) na wszystkich urządzeniach.</li>
          <li>
            Jeśli jesteś <strong>właścicielem zespołu</strong>, usunięcie konta usuwa również zlecenia, zdjęcia i dokumenty zespołu. Jeśli firma będzie nadal
            korzystać z Northpin, najpierw przekaż prawa właściciela (Ustawienia → Zespół) i anuluj subskrypcję App Store w Ustawieniach iOS.
          </li>
          <li>Jeśli jesteś członkiem zespołu, Twoje zlecenia pozostają w zespole; usuwane są tylko Twój login i dane osobowe.</li>
          <li>
            Twoje dane są natychmiast usuwane z naszej produkcyjnej bazy danych i magazynu plików, a z kopii zapasowych — w miarę wygasania tych kopii, zgodnie z
            opisem w <Link href="/privacy#retention">Polityce prywatności</Link>. Kopie zapisane na Twoich urządzeniach pozostają tam, dopóki nie usuniesz aplikacji
            lub jej danych.
          </li>
        </ul>
        <p>
          Nie możesz się zalogować? Napisz na adres <Ph>{COMPANY.privacyEmail}</Ph> z adresu e-mail swojego konta, z tematem „Delete my account” („Usuń moje
          konto”), a zrobimy to za Ciebie po potwierdzeniu Twojej tożsamości, w ciągu {RETENTION.deletionRequestDays} dni od otrzymania wiadomości.
        </p>
      </Section>

      <Section item={S.security}>
        <p>
          Jeśli uważasz, że znalazłeś(-aś) lukę w zabezpieczeniach, wyślij szczegóły na adres <Ph>{COMPANY.securityEmail}</Ph>. Daj nam rozsądny czas na jej
          usunięcie przed jej ujawnieniem i podczas testów nie uzyskuj dostępu do danych innych Usługobiorców ani nie zakłócaj działania Usługi. Doceniamy
          odpowiedzialne zgłoszenia.
        </p>
      </Section>
    </>
  ),
};

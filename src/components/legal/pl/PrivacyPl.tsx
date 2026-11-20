// Polish translation of /privacy, for convenience only: the English text in src/app/privacy/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";
import SubprocessorTablePl from "./SubprocessorTablePl";

const S = {
  scope: { id: "scope", title: "Kim jesteśmy i czego dotyczy ta polityka" },
  collect: { id: "collect", title: "Jakie informacje zbieramy" },
  use: { id: "use", title: "Jak wykorzystujemy informacje" },
  ai: { id: "ai", title: "Przetwarzanie przez AI" },
  sharing: { id: "sharing", title: "Komu udostępniamy informacje" },
  subprocessors: { id: "subprocessors", title: "Podmioty przetwarzające" },
  retention: { id: "retention", title: "Przechowywanie i usuwanie" },
  security: { id: "security", title: "Bezpieczeństwo" },
  rights: { id: "rights", title: "Twoje prawa i możliwości wyboru" },
  clients: { id: "your-clients", title: "Informacje o klientach naszych Usługobiorców" },
  transfers: { id: "transfers", title: "Przekazywanie danych za granicę" },
  children: { id: "children", title: "Dzieci" },
  changes: { id: "changes", title: "Zmiany niniejszej polityki" },
  contact: { id: "contact", title: "Kontakt" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const privacyPl: LegalTranslation = {
  title: "Polityka prywatności",
  toc,
  intro: (
    <p>
      Wykonawcy instalacji elektrycznych, niskoprądowych i specjalistycznych powierzają Northpin swoje plany, wyceny, faktury, zlecenia i dane swoich klientów.
      Niniejsza polityka wyjaśnia prostym językiem, co zbieramy, w jakim celu, kto pomaga nam to przetwarzać, jak długo to przechowujemy i jak możesz nad tym
      panować. W skrócie: wykorzystujemy Twoje dane, aby obsługiwać dla Ciebie Northpin, nie sprzedajemy ich i nie używamy ich do trenowania modeli AI.
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          Operatorem Northpin jest <Ph>{COMPANY.legalName}</Ph> („Northpin”, „my”, „nas”) z siedzibą w Stanach Zjednoczonych. Niniejsza polityka obejmuje naszą
          stronę internetową, aplikację internetową i aplikację na iOS (łącznie „Usługa”).
        </p>
        <p>Northpin jest narzędziem dla firm, dlatego przetwarzamy dane osobowe w dwóch rolach:</p>
        <ul>
          <li>
            <strong>Jako przedsiębiorca (administrator)</strong> — w odniesieniu do informacji o firmach i osobach, które rejestrują się w Northpin i z niego
            korzystają: dane konta, rozliczeń, pomocy technicznej i korzystania z Usługi.
          </li>
          <li>
            <strong>Jako usługodawca (podmiot przetwarzający)</strong> — w odniesieniu do danych zleceń, które nasi Usługobiorcy wprowadzają do Northpin, w tym
            informacji o ich własnych klientach. To nasi Usługobiorcy decydują, co i w jakim celu jest wprowadzane; przetwarzamy te dane w ich imieniu na podstawie
            naszych <Link href="/terms">Warunków korzystania</Link> i <Link href="/legal/dpa">Umowy powierzenia przetwarzania danych</Link>. Zob.{" "}
            <a href="#your-clients">sekcję {n(S.clients)}</a>.
          </li>
        </ul>
      </Section>

      <Section item={S.collect} n={n(S.collect)}>
        <h3>Informacje, które nam przekazujesz</h3>
        <ul>
          <li>
            <strong>Informacje o koncie i zespole:</strong> imię i nazwisko, adres e-mail, hasło (przechowywane wyłącznie w postaci bezpiecznego skrótu przez
            naszego dostawcę uwierzytelniania), nazwa firmy, rola w zespole oraz wysyłane przez Ciebie zaproszenia.
          </li>
          <li>
            <strong>Profil firmy:</strong> nazwa firmy, logo, telefon, adres e-mail, adres, dane podatkowe i warunki płatności, które dodajesz do wycen, faktur i
            innych dokumentów.
          </li>
          <li>
            <strong>Informacje rozliczeniowe:</strong> dane kontaktowe do rozliczeń, plan i faktury. Dane karty są zbierane i przechowywane przez Stripe; widzimy
            tylko ograniczone informacje, takie jak marka karty, cztery ostatnie cyfry i data ważności.
          </li>
          <li>
            <strong>Dane zleceń („Dane Usługobiorcy”):</strong> projekty, zestawy planów i rysunki, rozmieszczenie urządzeń, trasy przewodów i pomiary, przedmiary,
            katalogi i ceny, wyceny i kosztorysy, faktury, faktury korygujące i zapisy płatności, zapytania RFI, zlecenia zmiany, formularze, listy kontrolne,
            zadania, harmonogramy, raporty dzienne, notatki, dokumenty i pliki. Mogą one obejmować imiona i nazwiska, adresy, numery telefonów i adresy e-mail
            Twoich klientów.
          </li>
          <li>
            <strong>Zdjęcia i ich metadane:</strong> zdjęcia, które robisz lub przesyłasz, wraz z podpisami, tagami i adnotacjami. Zdjęcia mogą zawierać osadzone
            metadane (EXIF), takie jak czas wykonania, model aparatu i <strong>lokalizacja GPS</strong>; Northpin odczytuje lokalizację i czas, aby umieszczać
            zdjęcia na mapach zleceń i w raportach.
          </li>
          <li>
            <strong>Korespondencja z pomocą techniczną:</strong> to, co nam przesyłasz, kontaktując się z pomocą techniczną.
          </li>
        </ul>
        <h3>Informacje zbierane automatycznie</h3>
        <ul>
          <li>
            <strong>Lokalizacja urządzenia</strong> — wyłącznie jeśli zezwolisz na to na swoim urządzeniu — w celu oznaczania zdjęć lokalizacją i pokazywania
            pobliskich zleceń na mapie. Możesz to w każdej chwili wyłączyć w ustawieniach przeglądarki lub iOS.
          </li>
          <li>
            <strong>Dostęp do aparatu</strong> — wyłącznie gdy zdecydujesz się zrobić zdjęcie w aplikacji.
          </li>
          <li>
            <strong>Diagnostyka:</strong> gdy w aplikacji wystąpi błąd, wysyła ona do nas raport o błędzie: komunikat błędu i techniczny ślad stosu, adres strony
            (z usuniętymi parametrami zapytania i tokenami), wersję przeglądarki lub aplikacji, platformę oraz — jeśli jesteś zalogowany(-a) — Twój identyfikator
            użytkownika. Przed wysłaniem tych raportów usuwamy z nich adresy e-mail i tokeny dostępu.
          </li>
          <li>
            <strong>Logi serwera i bezpieczeństwa:</strong> nasz dostawca hostingu rejestruje techniczne dane żądań, takie jak adres IP, czas, żądany adres i typ
            przeglądarki. Wykorzystujemy adresy IP do ochrony Usługi, w tym do ograniczania liczby żądań.
          </li>
        </ul>
        <h3 id="cookies">Pliki cookie i pamięć lokalna</h3>
        <p>
          Northpin nie używa reklamowych ani analitycznych plików cookie ani narzędzi śledzących podmiotów trzecich. Aby działać offline i utrzymywać Cię w stanie
          zalogowania, przechowuje dane na Twoim urządzeniu:
        </p>
        <ul>
          <li>
            <strong>Twoje zlecenia</strong> w bazie danych przeglądarki (IndexedDB) lub w pamięci aplikacji na iOS, abyś mógł(-a) pracować bez połączenia.
          </li>
          <li>
            <strong>Twoją sesję logowania</strong> w pamięci lokalnej przeglądarki (lub w pęku kluczy iOS), abyś pozostawał(-a) zalogowany(-a).
          </li>
          <li>
            <strong>Strony aplikacji</strong> w pamięci podręcznej offline przeglądarki (service worker), aby aplikacja otwierała się bez zasięgu.
          </li>
          <li>
            <strong>Drobne preferencje</strong>, takie jak bieżący zespół, ustawienia mapy i zdjęć oraz imię wpisane podczas odpowiadania na link, który ktoś Ci
            przesłał, abyś nie musiał(-a) wpisywać ich ponownie na tym urządzeniu.
          </li>
        </ul>
        <p>
          Wszystkie one są niezbędne do działania Usługi. Pozostają na Twoim urządzeniu, dopóki się nie wylogujesz i nie wyczyścisz danych witryny w przeglądarce
          albo nie odinstalujesz aplikacji. Gdy płacisz w przeglądarce, strony płatności i rozliczeń Stripe (w witrynie Stripe) mogą ustawiać własne pliki cookie
          na potrzeby płatności i zapobiegania oszustwom, zgodnie z polityką prywatności Stripe.
        </p>
        <h3>Informacje o osobach otrzymujących linki</h3>
        <p>
          Gdy jeden z naszych Usługobiorców wysyła link do wyceny, oferty, faktury, zlecenia zmiany, zapytania RFI lub raportu zdjęciowego, a odbiorca go otworzy,
          możemy zarejestrować, że link został otwarty i kiedy. Jeśli odbiorca odpowie (na przykład zaakceptuje lub odrzuci wycenę, podpisze zlecenie zmiany lub
          odpowie na zapytanie RFI), rejestrujemy wpisane przez niego imię i nazwisko, podpis, wybrane opcje, notatkę lub odpowiedź oraz czas i udostępniamy te
          informacje Usługobiorcy, który wysłał link.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>Wykorzystujemy informacje, aby:</p>
        <ul>
          <li>
            świadczyć Usługę: przechowywać i synchronizować Twoje zlecenia między Twoimi urządzeniami i zespołem oraz generować przedmiary, wyceny, faktury, pliki
            PDF, raporty i linki dla klientów;
          </li>
          {AI_ENABLED && <li>uruchamiać funkcje AI, gdy z nich korzystasz (zob. poniżej);</li>}
          <li>obsługiwać płatności i zarządzać subskrypcjami;</li>
          <li>
            wysyłać wiadomości e-mail związane z Usługą, takie jak linki do logowania, zaproszenia do zespołu, dokumenty wysyłane przez Ciebie klientom, potwierdzenia
            płatności i informacje o ważnych zmianach;
          </li>
          <li>udzielać pomocy technicznej oraz diagnozować i usuwać problemy;</li>
          <li>dbać o bezpieczeństwo Usługi i naszych Usługobiorców, zapobiegać nadużyciom i egzekwować nasze Warunki;</li>
          <li>rozumieć ogólne korzystanie z Usługi w formie zagregowanej lub zanonimizowanej, aby ulepszać Northpin; oraz</li>
          <li>wypełniać obowiązki prawne.</li>
        </ul>
        <p>
          <strong>Nie</strong> sprzedajemy danych osobowych, nie udostępniamy ich na potrzeby reklamy behawioralnej opartej na różnych kontekstach ani nie
          wykorzystujemy Danych Usługobiorcy do trenowania modeli AI. Jeśli kiedykolwiek będziemy wysyłać wiadomości marketingowe, możesz w każdej chwili
          zrezygnować z ich otrzymywania.
        </p>
        <p>
          Tam, gdzie mają zastosowanie przepisy na wzór RODO, podstawami prawnymi przetwarzania są: wykonanie zawartej z Tobą umowy; nasze prawnie uzasadnione
          interesy polegające na prowadzeniu, zabezpieczaniu i ulepszaniu usługi dla firm (wyważone względem Twoich praw); Twoja zgoda, na przykład na dostęp do
          lokalizacji urządzenia (którą możesz wycofać); oraz obowiązki prawne.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Funkcje AI — odczytywanie arkusza planu, sugerowanie rozmieszczenia urządzeń, objaśnianie arkusza, podpisywanie zdjęcia lub przygotowywanie wersji
            roboczej dziennika budowy — działają tylko wtedy, gdy ktoś z Twojego zespołu z nich korzysta. Wówczas odpowiedni obraz lub obrazy oraz powiązany tekst
            (np. nazwy pomieszczeń, podpisy, notatki lub Twój katalog urządzeń) są przesyłane do Anthropic, PBC w celu przetworzenia na jego warunkach
            komercyjnych. Zgodnie z tymi warunkami Anthropic nie wykorzystuje tych danych do trenowania swoich modeli i może je przechowywać przez ograniczony czas
            w celach takich jak zaufanie i bezpieczeństwo, jak opisano w jego warunkach komercyjnych i zasadach. Wyniki AI wracają do Northpin jako sugestie, które
            musi zweryfikować człowiek.
          </p>
        </Section>
      )}

      <Section item={S.sharing} n={n(S.sharing)}>
        <p>Udostępniamy informacje wyłącznie:</p>
        <ul>
          <li>
            <strong>W obrębie Twojego zespołu:</strong> członkowie zespołu widzą zlecenia zespołu zgodnie ze swoją rolą.
          </li>
          <li>
            <strong>Wybranym przez Ciebie osobom:</strong> gdy wysyłasz wycenę, fakturę, raport lub inny link albo podłączasz integrację, taką jak Billdu, wysyłamy
            odpowiednie dane tam, gdzie wskażesz.
          </li>
          <li>
            <strong>Podmiotom przetwarzającym</strong>, które hostują i obsługują dla nas części Usługi na podstawie umów ograniczających wykorzystanie przez nie
            danych (wymienionym poniżej).
          </li>
          <li>
            <strong>Z przyczyn prawnych:</strong> aby przestrzegać prawa lub wykonać ważne wezwanie lub postępowanie prawne albo chronić prawa, bezpieczeństwo i
            ochronę naszych Usługobiorców, społeczeństwa lub Northpin. Jeśli będzie to dozwolone, poinformujemy Cię o żądaniach dotyczących Twoich danych.
          </li>
          <li>
            <strong>W ramach przeniesienia przedsiębiorstwa:</strong> jeśli Northpin będzie uczestniczyć w połączeniu, przejęciu lub sprzedaży aktywów, z
            zastrzeżeniem niniejszej polityki.
          </li>
        </ul>
        <p>
          Mapa zleceń pobiera kafelki mapy z serwerów OpenStreetMap bezpośrednio w Twojej przeglądarce, więc serwery te otrzymują Twój adres IP i żądany obszar
          mapy, jak w przypadku każdej strony internetowej. Czcionki są udostępniane z naszych własnych serwerów, więc strony otwierane przez Twoich klientów nie
          łączą się z zewnętrznymi usługami czcionek.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <SubprocessorTablePl />
        <p>
          Jeśli podłączysz Billdu, dane zleceń i klientów, które zdecydujesz się wysłać, trafiają do Billdu na podstawie Twojej własnej umowy z tym dostawcą.
          Aktualna lista jest zawsze dostępna na stronie <Link href="/legal/subprocessors">Podmioty przetwarzające</Link>. Zaktualizujemy ją przed dodaniem nowego
          podmiotu przetwarzającego, który obsługuje Dane Usługobiorcy; Usługobiorcy mogą poprosić o powiadomienie pod adresem <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.retention} n={n(S.retention)}>
        <ul>
          <li>
            <strong>Dane Usługobiorcy</strong> są przechowywane, dopóki istnieje Twoje konto. Gdy usuwasz element, zostaje on oznaczony jako usunięty, aby Twoje
            pozostałe urządzenia i urządzenia Twojego zespołu również go usunęły; oznaczony rekord pozostaje w naszej bazie danych, ukryty w aplikacji, do czasu
            usunięcia konta lub do chwili, gdy poprosisz nas o jego usunięcie.
          </li>
          <li>
            <strong>Usunięcie konta</strong> w aplikacji natychmiast usuwa Twój login oraz Twoje zlecenia, pliki i dokumenty z naszej produkcyjnej bazy danych i
            magazynu plików (zlecenia członka zespołu pozostają w jego zespole; zob. <Link href="/support#delete-account">Pomoc</Link>).
          </li>
          <li>
            <strong>Po zakończeniu subskrypcji</strong> konto przechodzi w tryb tylko do odczytu, a jego dane są przechowywane, abyś mógł(-a) je wyeksportować lub
            wrócić. Na razie nie usuwamy automatycznie zakończonych kont: Dane Usługobiorcy są usuwane, gdy usuniesz je w aplikacji, lub w ciągu{" "}
            {RETENTION.deletionRequestDays} dni od pisemnego żądania właściciela konta wysłanego na adres <Ph>{COMPANY.privacyEmail}</Ph>.
          </li>
          <li>
            <strong>Kopie zapasowe:</strong> usunięte dane pozostają w naszych zaszyfrowanych kopiach zapasowych bazy danych do czasu ich wygaśnięcia, w ciągu{" "}
            <Ph>{RETENTION.backupDays}</Ph> dni.
          </li>
          <li>
            <strong>Raporty o błędach</strong> są automatycznie usuwane po {RETENTION.errorReportDays} dniach. Logi serwera są przechowywane przez naszego
            dostawcę hostingu przez krótki czas zgodnie z jego ustawieniami przechowywania.
          </li>
          <li>
            <strong>Dokumentacja rozliczeniowa</strong> jest przechowywana tak długo, jak wymagają tego przepisy podatkowe i rachunkowe (zwykle do siedmiu lat).
          </li>
          <li>
            <strong>Dane na Twoich urządzeniach</strong> pozostają tam, dopóki ich nie usuniesz, nie wylogujesz się i nie wyczyścisz danych aplikacji lub nie
            odinstalujesz aplikacji.
          </li>
        </ul>
        <p>
          Możesz w każdej chwili wyeksportować swoje zlecenia i usunąć konto z poziomu aplikacji; zob. <Link href="/support#delete-account">Pomoc</Link>. Zdjęcia
          zachowują oryginalne metadane (w tym lokalizację GPS) po wyeksportowaniu lub udostępnieniu, więc sprawdź je przed wysłaniem poza swoją firmę.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>Stosujemy zabezpieczenia administracyjne, techniczne i fizyczne odpowiednie dla usługi dla firm, w tym:</p>
        <ul>
          <li>szyfrowanie podczas przesyłania (HTTPS/TLS z HSTS) oraz szyfrowanie w spoczynku naszej bazy danych i magazynu plików;</li>
          <li>
            zabezpieczenia na poziomie wierszy w bazie danych, dzięki którym każde konto i zespół ma dostęp wyłącznie do własnych danych, z uprawnieniami opartymi
            na rolach w obrębie zespołu;
          </li>
          <li>
            klucze po stronie serwera przechowywane poza przeglądarką i aplikacją oraz dane uwierzytelniające integracji zewnętrznych szyfrowane w spoczynku
            (AES-256-GCM);
          </li>
          <li>rygorystyczne nagłówki bezpieczeństwa przeglądarki, ograniczanie liczby żądań i ochronę przed nadużyciami w przypadku wrażliwych punktów końcowych;</li>
          <li>regularne kopie zapasowe bazy danych; oraz</li>
          <li>dostęp do systemów produkcyjnych ograniczony do osób, które potrzebują go do prowadzenia i wspierania Usługi.</li>
        </ul>
        <p>
          Żaden system nie jest w pełni bezpieczny. Jeśli dowiemy się o naruszeniu dotyczącym Twoich danych osobowych, powiadomimy Ciebie i właściwe organy
          zgodnie z wymogami prawa. Luki w zabezpieczeniach zgłaszaj na adres <Ph>{COMPANY.securityEmail}</Ph>.
        </p>
      </Section>

      <Section item={S.rights} n={n(S.rights)}>
        <p>W zależności od miejsca zamieszkania możesz mieć prawo do:</p>
        <ul>
          <li>uzyskania informacji o przechowywanych przez nas danych osobowych na Twój temat i dostępu do nich oraz otrzymania ich kopii w przenośnym formacie;</li>
          <li>sprostowania nieprawidłowych informacji;</li>
          <li>usunięcia swoich informacji;</li>
          <li>sprzeciwu wobec określonego przetwarzania lub jego ograniczenia oraz wycofania zgody, jeśli przetwarzanie się na niej opiera;</li>
          <li>
            rezygnacji ze „sprzedaży” lub „udostępniania” danych osobowych (nie sprzedajemy ani nie udostępniamy ich w tym rozumieniu) oraz ograniczenia
            wykorzystania danych wrażliwych, takich jak dokładna lokalizacja (wykorzystujemy ją wyłącznie do świadczenia Usługi); oraz
          </li>
          <li>wniesienia skargi do lokalnego organu ochrony danych.</li>
        </ul>
        <p>
          <strong>Mieszkańcy Kalifornii:</strong> w ciągu ostatnich 12 miesięcy zbieraliśmy identyfikatory, informacje handlowe (subskrypcje), informacje o
          aktywności w internecie (diagnostyka i logi), dane geolokalizacyjne (lokalizacja zdjęć i urządzenia), informacje audiowizualne (zdjęcia) oraz informacje
          zawodowe (firma i rola) w opisanych powyżej celach biznesowych i ujawnialiśmy je wymienionym powyżej usługodawcom. Nie sprzedawaliśmy ani nie
          udostępnialiśmy danych osobowych ani nie wykorzystywaliśmy wrażliwych danych osobowych w celach, które wymagają prawa do ograniczenia. Nie będziemy Cię
          dyskryminować za wykonywanie Twoich praw i możesz skorzystać z upoważnionego pełnomocnika. Respektujemy sygnały Global Privacy Control jako żądanie
          rezygnacji.
        </p>
        <p>
          Aby złożyć żądanie, skorzystaj z narzędzi w aplikacji (eksport, usunięcie konta) lub napisz na adres <Ph>{COMPANY.privacyEmail}</Ph>. Zweryfikujemy Twoje
          żądanie, zwykle przez potwierdzenie dostępu do adresu e-mail Twojego konta, i odpowiemy w terminie wymaganym przez prawo (na przykład 45 dni zgodnie z
          prawem Kalifornii lub jeden miesiąc zgodnie z RODO).
        </p>
      </Section>

      <Section item={S.clients} n={n(S.clients)}>
        <p>
          Jeśli jesteś klientem firmy korzystającej z Northpin (na przykład otrzymałeś(-aś) wycenę lub zapytanie RFI), to ta firma kontroluje Twoje informacje i
          decyduje o sposobie ich wykorzystania. Aby uzyskać do nich dostęp, sprostować je lub usunąć, skontaktuj się z tą firmą. Jeśli skontaktujesz się z nami,
          przekażemy jej Twoje żądanie i pomożemy jej na nie odpowiedzieć.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          Northpin jest prowadzony ze Stanów Zjednoczonych i przechowuje dane w lokalizacji <Ph>{COMPANY.dataRegion}</Ph>. Jeśli korzystasz z Northpin spoza USA,
          Twoje informacje są przekazywane do USA i tam przetwarzane. Tam, gdzie jest to wymagane, opieramy się na odpowiednich zabezpieczeniach:{" "}
          <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.children} n={n(S.children)}>
        <p>
          Northpin jest usługą dla firm i nie jest skierowany do dzieci. Nie zbieramy świadomie danych osobowych od osób poniżej 16. roku życia. Jeśli uważasz,
          że dziecko przekazało nam dane osobowe, skontaktuj się z nami, a usuniemy je.
        </p>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          Będziemy aktualizować niniejszą politykę, gdy zmienią się nasze praktyki, i zmieniać podaną powyżej datę wejścia w życie. Jeśli zmiana będzie istotna,
          powiadomimy właścicieli kont e-mailem lub w aplikacji, zanim wejdzie ona w życie.
        </p>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          Pytania lub żądania: <Ph>{COMPANY.privacyEmail}</Ph>
          <br />
          <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.address}</Ph>
        </p>
      </Section>
    </>
  ),
};

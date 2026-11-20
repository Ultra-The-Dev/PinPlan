// Polish translation of /legal/dpa, for convenience only: the English text in src/app/legal/dpa/page.tsx governs.
// Keep the sections and ids in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  scope: { id: "scope", title: "Zakres i role" },
  instructions: { id: "instructions", title: "Przetwarzanie na Twoje polecenie" },
  people: { id: "people", title: "Nasi pracownicy" },
  security: { id: "security", title: "Bezpieczeństwo" },
  subprocessors: { id: "subprocessors", title: "Dalsze podmioty przetwarzające" },
  requests: { id: "requests", title: "Pomoc przy żądaniach" },
  incidents: { id: "incidents", title: "Incydenty bezpieczeństwa" },
  deletion: { id: "deletion", title: "Zwrot i usunięcie danych" },
  audits: { id: "audits", title: "Informacje i audyty" },
  transfers: { id: "transfers", title: "Przekazywanie danych za granicę" },
  ccpa: { id: "ccpa", title: "Stanowe przepisy o ochronie prywatności w USA" },
  general: { id: "general", title: "Postanowienia ogólne" },
  details: { id: "details", title: "Załącznik: szczegóły przetwarzania" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const dpaPl: LegalTranslation = {
  title: "Umowa powierzenia przetwarzania danych",
  toc,
  intro: (
    <p>
      Niniejsza umowa stanowi część naszych <Link href="/terms">Warunków korzystania</Link> i ma zastosowanie za każdym razem, gdy przetwarzamy dane osobowe
      zawarte w Twoich Danych Usługobiorcy. Do jej obowiązywania nie musisz niczego podpisywać; jeśli potrzebujesz egzemplarza podpisanego przez nas, napisz na
      adres <Ph>{COMPANY.privacyEmail}</Ph>.
    </p>
  ),
  children: (
    <>
      <Section item={S.scope} n={n(S.scope)}>
        <p>
          W niniejszej umowie „my” oznacza <Ph>{COMPANY.legalName}</Ph>, a „Ty” oznacza Usługobiorcę, który zaakceptował Warunki. Pojęcia zdefiniowane w Warunkach
          (takie jak Dane Usługobiorcy i Usługa) mają tu to samo znaczenie. W odniesieniu do danych osobowych zawartych w Danych Usługobiorcy Ty jesteś
          administratorem (lub „przedsiębiorstwem” w rozumieniu przepisów USA), a my jesteśmy Twoim podmiotem przetwarzającym (lub usługodawcą). Jeśli działasz na
          rzecz innej osoby, na przykład generalnego wykonawcy lub właściciela budynku, jesteśmy Twoim dalszym podmiotem przetwarzającym.
        </p>
      </Section>

      <Section item={S.instructions} n={n(S.instructions)}>
        <p>
          Przetwarzamy Dane Usługobiorcy wyłącznie w celu świadczenia, zabezpieczenia i wspierania Usługi, na Twoje udokumentowane polecenie. Twoimi poleceniami są
          Warunki, Twoje ustawienia oraz sposób, w jaki Ty i Twoi Użytkownicy korzystacie z Usługi. Jeśli uznamy, że polecenie narusza przepisy o ochronie danych,
          poinformujemy Cię o tym. W inny sposób przetwarzamy Dane Usługobiorcy tylko wtedy, gdy wymaga tego prawo, i wcześniej Cię o tym poinformujemy, chyba że
          prawo nam tego zabrania.
        </p>
      </Section>

      <Section item={S.people} n={n(S.people)}>
        <p>
          Osoby, które mogą mieć dostęp do Danych Usługobiorcy, są zobowiązane do zachowania poufności i otrzymują dostęp tylko wtedy, gdy jest on im potrzebny do
          prowadzenia lub wspierania Usługi.
        </p>
      </Section>

      <Section item={S.security} n={n(S.security)}>
        <p>
          Stosujemy odpowiednie środki techniczne i organizacyjne w celu ochrony Danych Usługobiorcy, w tym opisane w{" "}
          <Link href="/privacy#security">sekcji „Bezpieczeństwo” naszej Polityki prywatności</Link>: szyfrowanie podczas przesyłania i przechowywania,
          zabezpieczenia na poziomie wierszy bazy danych oddzielające dane każdej firmy, dostęp oparty na rolach w obrębie zespołu, ograniczony dostęp do środowiska
          produkcyjnego oraz regularne kopie zapasowe. Możemy aktualizować te środki, o ile ogólny poziom ochrony nie ulegnie obniżeniu.
        </p>
      </Section>

      <Section item={S.subprocessors} n={n(S.subprocessors)}>
        <p>
          Wyrażasz zgodę na dalsze podmioty przetwarzające wskazane na naszej <Link href="/legal/subprocessors">liście podmiotów przetwarzających</Link>. Każdy z
          nich zobowiązujemy do przestrzegania warunków ochrony danych zapewniających co najmniej taki poziom ochrony jak niniejsza umowa i pozostajemy
          odpowiedzialni za jego działania. Zaktualizujemy listę, zanim nowy dalszy podmiot przetwarzający zacznie przetwarzać Dane Usługobiorcy, i powiadomimy Cię
          e-mailem, jeśli poprosisz o takie powiadomienia pod adresem <Ph>{COMPANY.privacyEmail}</Ph>. Możesz zgłosić sprzeciw z uzasadnionych przyczyn
          dotyczących ochrony danych w ciągu 30 dni; jeśli nie będziemy w stanie uwzględnić sprzeciwu, możesz zakończyć korzystanie z części Usługi, której on
          dotyczy, i otrzymać zwrot opłat uiszczonych z góry za tę część.
        </p>
      </Section>

      <Section item={S.requests} n={n(S.requests)}>
        <p>
          Usługa pozwala Ci samodzielnie uzyskiwać dostęp do Danych Usługobiorcy, poprawiać je, eksportować i usuwać. Jeśli otrzymamy żądanie dotyczące Danych
          Usługobiorcy od jednego z Twoich Użytkowników lub Klientów, przekażemy je Tobie i nie będziemy na nie sami odpowiadać, chyba że nas o to poprosisz.
          Udzielimy Ci rozsądnej pomocy przy żądaniach, których nie możesz obsłużyć w Usłudze, a także przy ocenach skutków dla ochrony danych i konsultacjach z
          organami nadzorczymi, w zakresie, w jakim dotyczą one Usługi.
        </p>
      </Section>

      <Section item={S.incidents} n={n(S.incidents)}>
        <p>
          Jeśli dowiemy się o naruszeniu bezpieczeństwa prowadzącym do nieuprawnionego dostępu do Danych Usługobiorcy albo do ich utraty, zmiany lub ujawnienia,
          poinformujemy Cię o tym bez zbędnej zwłoki, w miarę uzyskiwania informacji opiszemy, co się stało i jakie działania podejmujemy, oraz pomożemy Ci
          wypełnić Twoje własne obowiązki w zakresie zgłaszania naruszeń.
        </p>
      </Section>

      <Section item={S.deletion} n={n(S.deletion)}>
        <p>
          Możesz eksportować Dane Usługobiorcy w dowolnym momencie, dopóki istnieje Twoje konto, także po zakończeniu subskrypcji. Usuwamy Dane Usługobiorcy, gdy
          usuniesz swoje konto w Usłudze, lub w ciągu {RETENTION.deletionRequestDays} dni od Twojego pisemnego żądania wysłanego na adres{" "}
          <Ph>{COMPANY.privacyEmail}</Ph>. Usunięte dane pozostają w zaszyfrowanych kopiach zapasowych do czasu ich wygaśnięcia, w ciągu{" "}
          <Ph>{RETENTION.backupDays}</Ph> dni, chyba że prawo wymaga od nas ich dłuższego przechowywania.
        </p>
      </Section>

      <Section item={S.audits} n={n(S.audits)}>
        <p>
          Na pisemne żądanie, nie częściej niż raz w roku (lub po incydencie bezpieczeństwa), odpowiemy na uzasadnione pytania o to, jak chronimy Dane
          Usługobiorcy, i udostępnimy odpowiednie podsumowania certyfikatów i raportów bezpieczeństwa naszych dalszych podmiotów przetwarzających. Każdy audyt
          wykraczający poza ten zakres odbywa się za porozumieniem, na Twój koszt, z rozsądnym wyprzedzeniem i z zachowaniem poufności.
        </p>
      </Section>

      <Section item={S.transfers} n={n(S.transfers)}>
        <p>
          Przechowujemy Dane Usługobiorcy w lokalizacji <Ph>{COMPANY.dataRegion}</Ph> i przetwarzamy je w Stanach Zjednoczonych. Jeśli przepisy o ochronie danych
          wymagają mechanizmu przekazywania dla danych osobowych przesyłanych do nas spoza USA, opieramy się na <Ph>{COMPANY.transferMechanism}</Ph>.
        </p>
      </Section>

      <Section item={S.ccpa} n={n(S.ccpa)}>
        <p>
          Jeśli zastosowanie ma kalifornijska ustawa o ochronie prywatności konsumentów (California Consumer Privacy Act) lub podobne prawo stanowe USA, działamy
          jako Twój usługodawca (lub podmiot przetwarzający). Nie będziemy sprzedawać ani udostępniać danych osobowych pochodzących z Danych Usługobiorcy,
          przechowywać, wykorzystywać ani ujawniać ich poza naszą bezpośrednią relacją biznesową z Tobą ani w jakimkolwiek innym celu niż świadczenie Usługi, ani
          łączyć ich z danymi osobowymi uzyskanymi od innych podmiotów, chyba że te przepisy na to pozwalają. Poinformujemy Cię, jeśli nie będziemy już w stanie
          wypełniać tych obowiązków.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <p>
          Niniejsza umowa obowiązuje tak długo, jak przetwarzamy dla Ciebie Dane Usługobiorcy. Mają do niej zastosowanie ograniczenia odpowiedzialności określone w
          Warunkach. W razie sprzeczności z Warunkami w zakresie przetwarzania danych osobowych pierwszeństwo ma niniejsza umowa.
        </p>
      </Section>

      <Section item={S.details} n={n(S.details)}>
        <table>
          <tbody>
            <tr>
              <th>Przedmiot i cel</th>
              <td>
                Świadczenie Usługi: przechowywanie, synchronizacja i wyświetlanie Danych Usługobiorcy, generowanie dokumentów i linków oraz pomoc techniczna.
              </td>
            </tr>
            <tr>
              <th>Czas trwania</th>
              <td>Przez cały okres istnienia Twojego konta, a następnie do czasu usunięcia, jak opisano powyżej.</td>
            </tr>
            <tr>
              <th>Charakter przetwarzania</th>
              <td>Hosting, przechowywanie, przesyłanie, wyświetlanie, tworzenie kopii zapasowych, usuwanie oraz inne operacje niezbędne do świadczenia Usługi.</td>
            </tr>
            <tr>
              <th>Osoby, których dane dotyczą</th>
              <td>
                Twoi Użytkownicy; Twoi Klienci i ich osoby kontaktowe; osoby wymienione w planach, zdjęciach, dokumentach i zapisach zleceń; odbiorcy wysyłanych
                przez Ciebie linków.
              </td>
            </tr>
            <tr>
              <th>Dane osobowe</th>
              <td>
                Imiona i nazwiska, adresy e-mail, numery telefonów i adresy pocztowe; adresy miejsc realizacji zleceń; podpisy; zdjęcia wraz z metadanymi czasu i
                lokalizacji; notatki, odpowiedzi i inne treści dodawane przez Ciebie lub Twoich Klientów.
              </td>
            </tr>
            <tr>
              <th>Dane szczególnie chronione</th>
              <td>
                Nie są przewidziane. W Warunkach prosimy, aby nie przechowywać danych wrażliwych, takich jak numery dokumentów tożsamości, informacje o
                zdrowiu czy kody dostępu.
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
    </>
  ),
};

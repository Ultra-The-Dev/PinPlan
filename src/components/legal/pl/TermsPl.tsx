// Polish translation of /terms, for convenience only: the English text in src/app/terms/page.tsx governs.
// Keep the sections, ids and conditions (AI_ENABLED) in step with the English page.
import Link from "next/link";
import { Ph, Section, type LegalTranslation, type TocItem } from "@/components/legal/LegalDoc";
import { AI_ENABLED } from "@/lib/features";
import { COMPANY, RETENTION } from "@/lib/legal";

const S = {
  agreement: { id: "agreement", title: "Umowa" },
  definitions: { id: "definitions", title: "Definicje" },
  accounts: { id: "accounts", title: "Konta i zespoły" },
  billing: { id: "billing", title: "Subskrypcje, okresy próbne i płatności" },
  data: { id: "customer-data", title: "Twoje dane" },
  ai: { id: "ai", title: "Funkcje AI" },
  proposals: { id: "proposals", title: "Kosztorysy, oferty i podpisy" },
  use: { id: "acceptable-use", title: "Dopuszczalne korzystanie" },
  thirdParty: { id: "third-party", title: "Usługi podmiotów trzecich" },
  availability: { id: "availability", title: "Dostępność, praca offline i kopie zapasowe" },
  ip: { id: "ip", title: "Nasza własność intelektualna" },
  confidentiality: { id: "confidentiality", title: "Poufność" },
  termination: { id: "termination", title: "Okres obowiązywania, anulowanie i rozwiązanie" },
  warranties: { id: "warranties", title: "Wyłączenia gwarancji" },
  liability: { id: "liability", title: "Ograniczenie odpowiedzialności" },
  indemnity: { id: "indemnity", title: "Zwolnienie z odpowiedzialności" },
  law: { id: "law", title: "Prawo właściwe i spory" },
  apple: { id: "apple", title: "Warunki Apple App Store" },
  changes: { id: "changes", title: "Zmiany niniejszych warunków" },
  general: { id: "general", title: "Postanowienia ogólne" },
  contact: { id: "contact", title: "Kontakt" },
} satisfies Record<string, TocItem>;
const toc = Object.values(S).filter((t) => AI_ENABLED || t !== S.ai);
const n = (item: TocItem) => toc.indexOf(item) + 1;

export const termsPl: LegalTranslation = {
  title: "Warunki korzystania",
  toc,
  intro: (
    <p>
      Northpin pomaga wykonawcom instalacji elektrycznych, niskoprądowych i specjalistycznych sporządzać przedmiary na podstawie planów, wysyłać wyceny i faktury
      oraz prowadzić zlecenia w terenie. Niniejsze warunki wyjaśniają, czego możesz od nas oczekiwać i czego my oczekujemy od Ciebie. Prosimy o ich przeczytanie;
      korzystając z Northpin, akceptujesz je.
    </p>
  ),
  children: (
    <>
      <Section item={S.agreement} n={n(S.agreement)}>
        <p>
          Niniejsze Warunki korzystania („Warunki”) stanowią umowę między <Ph>{COMPANY.legalName}</Ph>, <Ph>{COMPANY.entity}</Ph> („Northpin”, „my”, „nas”), a
          przedsiębiorstwem lub organizacją, która rejestruje się w Northpin („Usługobiorca”, „Ty”). Jeśli akceptujesz niniejsze Warunki w imieniu firmy,
          potwierdzasz, że jesteś upoważniony(-a) do jej reprezentowania. Jeśli nie masz takiego upoważnienia lub nie zgadzasz się z Warunkami, nie korzystaj z
          Northpin.
        </p>
        <p>
          Northpin jest narzędziem dla firm. Jest oferowany firmom i ich pracownikom wyłącznie do celów związanych z działalnością gospodarczą, a nie konsumentom do
          celów osobistych, rodzinnych lub domowych. Aby utworzyć konto, musisz mieć ukończone 18 lat.
        </p>
        <p>
          Nasza <Link href="/privacy">Polityka prywatności</Link> wyjaśnia, jak postępujemy z danymi osobowymi, i stanowi część niniejszych Warunków. Jeśli
          podpisałeś(-aś) z nami formularz zamówienia lub umowę powierzenia przetwarzania danych, w razie sprzeczności z niniejszymi Warunkami pierwszeństwo ma ten
          dokument.
        </p>
      </Section>

      <Section item={S.definitions} n={n(S.definitions)}>
        <ul>
          <li>
            <strong>Usługa</strong> oznacza stronę internetową Northpin, aplikację internetową, aplikację na iOS, interfejsy API oraz świadczoną przez nas pomoc
            techniczną z nimi związaną.
          </li>
          <li>
            <strong>Użytkownicy</strong> to osoby, którym pozwalasz korzystać z Usługi w ramach Twojego konta, takie jak właściciele, pracownicy biura i technicy z
            Twojego zespołu.
          </li>
          <li>
            <strong>Dane Usługobiorcy</strong> to wszystko, co Ty i Twoi Użytkownicy wprowadzacie do Usługi: zlecenia, plany i rysunki, rozmieszczenie urządzeń,
            przedmiary, ceny, wyceny i kosztorysy, faktury, faktury korygujące i zapisy płatności, zapytania RFI, zlecenia zmiany, formularze, listy kontrolne,
            zadania, harmonogramy, raporty dzienne, zdjęcia (wraz z metadanymi lokalizacji i czasu), notatki, dokumenty i pliki oraz informacje o Twoich własnych
            klientach.
          </li>
          <li>
            <strong>Twoi Klienci</strong> to osoby i firmy, dla których wykonujesz prace, w tym każdy, kto otworzy wysłany przez Ciebie link do wyceny, faktury,
            zlecenia zmiany, zapytania RFI lub raportu.
          </li>
        </ul>
      </Section>

      <Section item={S.accounts} n={n(S.accounts)}>
        <ul>
          <li>Podawaj nam prawdziwe informacje o koncie i aktualizuj je, w tym działający adres e-mail.</li>
          <li>
            Zachowuj hasła i kody dostępu w poufności i nie udostępniaj danych logowania. Każdy Użytkownik powinien mieć własny login. Odpowiadasz za wszystko, co
            dzieje się na Twoim koncie i co robią Twoi Użytkownicy, a także za nadawanie im ról (na przykład za to, którzy Użytkownicy widzą ceny).
          </li>
          <li>
            Niezwłocznie poinformuj nas pod adresem <Ph>{COMPANY.securityEmail}</Ph>, jeśli uważasz, że ktoś uzyskał dostęp do Twojego konta bez zezwolenia.
          </li>
          <li>
            Właściciel zespołu zarządza kontem zespołu. Jeśli właściciel odejdzie z Twojej firmy, skontaktuj się z nami, a pomożemy przenieść prawa właściciela, gdy
            tylko zweryfikujemy żądanie z Twoją firmą.
          </li>
        </ul>
      </Section>

      <Section item={S.billing} n={n(S.billing)}>
        <p>
          <strong>Plany i stanowiska.</strong> Płatne plany są rozliczane za każdy okres subskrypcji (miesięczny lub roczny) i mogą ograniczać liczbę Użytkowników
          („stanowisk”) lub inny zakres korzystania, jak wskazano na naszej <Link href="/pricing">stronie z cennikiem</Link> lub w Twoim zamówieniu.
          {AI_ENABLED && " W przypadku funkcji AI mogą obowiązywać limity korzystania, aby Usługa pozostała sprawiedliwa i niezawodna."}
        </p>
        <p>
          <strong>Bezpłatny okres próbny.</strong> Możemy oferować bezpłatny okres próbny. Po jego zakończeniu Usługa jest świadczona dalej tylko wtedy, gdy wybierzesz
          płatny plan. Jeśli tego nie zrobisz, Twoje konto zostanie ograniczone lub przejdzie w tryb tylko do odczytu, a Ty nadal będziesz mógł(-a) wyeksportować
          swoje dane w sposób opisany poniżej.
        </p>
        <p>
          <strong>Płatności.</strong> Płatności dokonywane przez stronę internetową są obsługiwane przez Stripe, Inc. Wykupując subskrypcję, upoważniasz nas do
          obciążania, za pośrednictwem Stripe, Twojej metody płatności na początku każdego okresu, aż do anulowania. Nie przechowujemy pełnych numerów kart.
          Subskrypcje odnawiają się automatycznie, chyba że zostaną anulowane przed datą odnowienia. Zakupy dokonane przez Apple App Store są rozliczane i
          zarządzane przez Apple na jego warunkach i muszą być anulowane przez Twoje konto Apple.
        </p>
        <p>
          <strong>Podatki.</strong> Ceny nie zawierają podatków, chyba że wskazano inaczej. Odpowiadasz za należne podatki od sprzedaży, podatki od używania i
          podobne podatki, z wyjątkiem podatków od naszego dochodu.
        </p>
        <p>
          <strong>Zmiany i zwroty.</strong> Możemy zmieniać ceny z co najmniej 30-dniowym wyprzedzeniem; zmiany obowiązują od Twojego następnego odnowienia. Opłaty
          nie podlegają zwrotowi i nie udzielamy uznań za niepełne okresy, chyba że wymaga tego prawo lub zakończymy świadczenie Usługi bez uzasadnionej przyczyny — w takim przypadku
          zwracamy opłaty uiszczone z góry za niewykorzystany okres.
        </p>
        <p>
          <strong>Opóźnienie w płatności.</strong> Jeśli płatność się nie powiedzie, poinformujemy Cię o tym i ponowimy próbę. Jeśli pozostanie nieopłacona przez 14
          dni od powiadomienia, możemy zawiesić płatne funkcje do czasu jej uregulowania.
        </p>
      </Section>

      <Section item={S.data} n={n(S.data)}>
        <p>
          <strong>Jesteś właścicielem swoich Danych Usługobiorcy.</strong> Udzielasz nam ograniczonej licencji na hostowanie, kopiowanie, przesyłanie, przetwarzanie
          i wyświetlanie Danych Usługobiorcy wyłącznie w zakresie niezbędnym do świadczenia, zabezpieczenia i wspierania Usługi na Twoją rzecz, zapobiegania
          nadużyciom oraz zgodnie z wymogami prawa. Nie sprzedajemy Danych Usługobiorcy i nie wykorzystujemy ich do kierowania reklam do Ciebie ani do nikogo
          innego.
        </p>
        <p>
          <strong>Twoje obowiązki.</strong> Odpowiadasz za Dane Usługobiorcy oraz za posiadanie praw i zezwoleń niezbędnych do wprowadzenia ich do Usługi. Dotyczy
          to przesyłanych przez Ciebie planów pięter i rysunków (które mogą należeć do architektów, inżynierów lub właścicieli budynków), zdjęć wykonanych w
          obiektach Twoich Klientów oraz danych osobowych Twoich Klientów, takich jak imiona i nazwiska, adresy, numery telefonów, adresy e-mail i podpisy. Tam,
          gdzie wymaga tego prawo, odpowiadasz za poinformowanie Twoich Klientów o tym, jak wykorzystujesz ich informacje, i za uzyskanie ich zgody.
        </p>
        <p>
          <strong>Nasza rola.</strong> W odniesieniu do danych osobowych zawartych w Danych Usługobiorcy działamy jako Twój usługodawca (lub „podmiot
          przetwarzający”) i przetwarzamy je na Twoje polecenie, jak opisano w naszej <Link href="/privacy">Polityce prywatności</Link> i naszej{" "}
          <Link href="/legal/dpa">Umowie powierzenia przetwarzania danych</Link>, która stanowi część niniejszych Warunków. Egzemplarz podpisany przez nas jest
          dostępny na żądanie pod adresem <Ph>{COMPANY.privacyEmail}</Ph>.
        </p>
        <p>
          <strong>Informacje wrażliwe.</strong> Nie używaj Usługi do przechowywania numerów kart płatniczych, numerów dokumentów tożsamości, informacji o zdrowiu,
          kodów alarmów, kodów do drzwi ani haseł do systemów Twoich Klientów. Usługa nie jest przeznaczona do tego rodzaju danych.
        </p>
        <p>
          <strong>Dane zagregowane.</strong> Możemy wykorzystywać zanonimizowane, zagregowane informacje o sposobie korzystania z Usługi (na przykład o liczbie
          tworzonych zleceń) do jej prowadzenia i ulepszania, o ile nie pozwalają one zidentyfikować Ciebie, Twoich Użytkowników ani Twoich Klientów.
        </p>
      </Section>

      {AI_ENABLED && (
        <Section item={S.ai} n={n(S.ai)}>
          <p>
            Niektóre funkcje wykorzystują sztuczną inteligencję: odczytywanie arkuszy planu, sugerowanie rozmieszczenia urządzeń, objaśnianie arkusza, podpisywanie
            zdjęć i przygotowywanie wersji roboczych dziennika budowy. Gdy korzystasz z takiej funkcji, odpowiednie obrazy i tekst (na przykład arkusz planu,
            zdjęcie, nazwy pomieszczeń lub Twój katalog urządzeń) są przesyłane do naszego dostawcy AI, Anthropic, PBC, w celu przetworzenia na jego warunkach
            komercyjnych. Zgodnie z tymi warunkami Anthropic nie wykorzystuje tych danych do trenowania swoich modeli.
          </p>
          <ul>
            <li>
              <strong>Wyłącznie sugestie.</strong> Wyniki AI mogą być błędne lub niekompletne. Sugerowane urządzenia nigdy nie są uwzględniane w przedmiarze ani
              kosztorysie, dopóki nie zaakceptuje ich osoba z Twojego zespołu. Odpowiadasz za sprawdzenie ilości, cen, podpisów i raportów, zanim zaczniesz na nich
              polegać lub komukolwiek je wyślesz.
            </li>
            <li>
              <strong>To nie jest porada specjalistyczna.</strong> Northpin nie udziela porad inżynieryjnych, projektowych, dotyczących zgodności z przepisami
              technicznymi, ochrony przeciwpożarowej i bezpieczeństwa życia ani porad prawnych, a wyniki AI ich nie zastępują.
            </li>
            <li>
              <strong>Twój wybór.</strong> Funkcje AI działają tylko wtedy, gdy ktoś z Twojego zespołu z nich korzysta.
            </li>
          </ul>
        </Section>
      )}

      <Section item={S.proposals} n={n(S.proposals)}>
        <p>
          Northpin umożliwia tworzenie wycen, faktur, zleceń zmiany, zapytań RFI, raportów zdjęciowych i innych dokumentów oraz linków, które Twoi Klienci mogą
          otwierać, na które mogą odpowiadać, które mogą podpisywać i akceptować. O ich treści, cenach i warunkach decydujesz Ty. Każda zawarta umowa wiąże Ciebie
          i Twojego Klienta; nie jesteśmy jej stroną i nie odpowiadamy za jej warunki, za Twoją pracę ani za to, czy podpis elektroniczny jest ważny dla Twojego
          celu w Twojej jurysdykcji. Faktury i zapisy płatności w Northpin są Twoją dokumentacją: odpowiadasz za naliczane przez siebie podatki i za własną
          księgowość. Każdy, kto ma link do dokumentu, może go wyświetlić, dlatego udostępniaj linki wyłącznie zamierzonemu odbiorcy i wycofuj linki, które nie
          powinny już być aktywne.
        </p>
        <p>
          Integracje, takie jak Billdu, przesyłają dane do innej usługi na Twoje polecenie. Korzystanie z tej usługi podlega Twojej umowie z jej dostawcą.
        </p>
      </Section>

      <Section item={S.use} n={n(S.use)}>
        <p>Zobowiązujesz się, że ani Ty, ani nikt, komu na to pozwolisz, nie będzie:</p>
        <ul>
          <li>naruszać prawa ani czyichkolwiek praw ani przesyłać treści, do których wykorzystania nie masz prawa;</li>
          <li>przesyłać złośliwego oprogramowania ani próbować uzyskać dostępu do kont, danych lub systemów, do których nie masz uprawnień;</li>
          <li>
            sondować, skanować ani testować podatności Usługi inaczej niż w ramach naszej procedury odpowiedzialnego ujawniania luk (zob. Pomoc);
          </li>
          <li>
            przeciążać ani zakłócać działania Usługi, obchodzić limitów korzystania ani uzyskiwać do niej dostępu w sposób zautomatyzowany inaczej niż przez nasze
            opublikowane interfejsy API;
          </li>
          <li>
            odsprzedawać Usługi, udzielać do niej sublicencji ani świadczyć jej podmiotom trzecim jako biuro usługowe, z wyjątkiem udostępniania jej Twoim własnym
            Klientom zgodnie z przeznaczeniem Usługi;
          </li>
          <li>
            kopiować Usługi, poddawać jej inżynierii wstecznej ani tworzyć na jej podstawie konkurencyjnego produktu, chyba że prawo wyraźnie na to zezwala; ani
          </li>
          <li>wykorzystywać Usługi do nękania kogokolwiek ani do wysyłania spamu.</li>
        </ul>
        <p>
          Możemy zawiesić dostęp, który w naszej uzasadnionej ocenie narusza niniejszą sekcję lub stwarza zagrożenie dla Usługi lub innych Usługobiorców, i — gdy
          będzie to możliwe — poinformujemy Cię o przyczynie.
        </p>
      </Section>

      <Section item={S.thirdParty} n={n(S.thirdParty)}>
        <p>
          Usługa korzysta z dostawców zewnętrznych wymienionych w naszej <Link href="/privacy#subprocessors">Polityce prywatności</Link>. Mapy w Usłudze
          wykorzystują dane OpenStreetMap, © współtwórcy OpenStreetMap. Produkty podmiotów trzecich, które zdecydujesz się podłączyć, są dostarczane przez te
          podmioty, a nie przez nas.
        </p>
      </Section>

      <Section item={S.availability} n={n(S.availability)}>
        <p>
          Dokładamy starań, aby Usługa była dostępna i działała szybko, ale może ona być czasami niedostępna z powodu konserwacji, aktualizacji lub przyczyn od nas
          niezależnych. Northpin jest zaprojektowany tak, aby działał offline: wprowadzane przez Ciebie dane są najpierw zapisywane na Twoim urządzeniu i
          synchronizowane z naszymi serwerami, gdy dostępne jest połączenie. Dane, które nie zostały jeszcze zsynchronizowane, istnieją tylko na tym urządzeniu,
          więc mogą zostać utracone, jeśli urządzenie zostanie zgubione lub zresetowane albo pamięć przeglądarki zostanie wyczyszczona.
        </p>
        <p>
          Regularnie wykonujemy kopie zapasowe zsynchronizowanych danych (zob. naszą <Link href="/privacy#retention">Politykę prywatności</Link>), ale kopie
          zapasowe służą do odtwarzania po awarii i nie zastępują Twojej własnej dokumentacji. Możesz w każdej chwili wyeksportować swoje zlecenia.
        </p>
      </Section>

      <Section item={S.ip} n={n(S.ip)}>
        <p>
          Jesteśmy właścicielem Usługi, w tym jej oprogramowania, projektu, symboli i dokumentacji. Dopóki Twoja subskrypcja jest aktywna, udzielamy Tobie i Twoim
          Użytkownikom niewyłącznego, niezbywalnego prawa do korzystania z Usługi do wewnętrznych celów Twojej działalności zgodnie z niniejszymi Warunkami. Jeśli
          przekażesz nam pomysły lub opinie, możemy je wykorzystać bez żadnych zobowiązań wobec Ciebie.
        </p>
      </Section>

      <Section item={S.confidentiality} n={n(S.confidentiality)}>
        <p>
          Każda ze stron będzie chronić niepubliczne informacje biznesowe drugiej strony z należytą starannością, wykorzystywać je wyłącznie do celów niniejszej
          umowy i udostępniać je tylko osobom i dostawcom, którzy ich potrzebują i są zobowiązani do ich ochrony. Nie dotyczy to informacji, które są publicznie
          dostępne, były już znane, zostały opracowane niezależnie lub których ujawnienia wymaga prawo (z powiadomieniem, jeśli jest to dozwolone).
        </p>
      </Section>

      <Section item={S.termination} n={n(S.termination)}>
        <ul>
          <li>
            <strong>Anulowanie.</strong> Możesz anulować subskrypcję w dowolnym momencie w ustawieniach płatności (lub przez Apple, jeśli tam ją wykupiłeś(-aś)).
            Anulowanie wchodzi w życie z końcem bieżącego okresu.
          </li>
          <li>
            <strong>Rozwiązanie przez nas.</strong> Możemy rozwiązać umowę lub zawiesić Twoje konto, jeśli istotnie naruszysz niniejsze Warunki i nie usuniesz
            naruszenia w ciągu 15 dni od powiadomienia, ze skutkiem natychmiastowym w przypadku poważnych naruszeń zasad dopuszczalnego korzystania lub jeśli wymaga
            tego prawo. Możemy zaprzestać oferowania Usługi z co najmniej 60-dniowym wyprzedzeniem i zwrotem opłat uiszczonych z góry za niewykorzystany okres.
          </li>
          <li>
            <strong>Twoje dane po zakończeniu.</strong> Gdy Twoja subskrypcja się zakończy, konto przechodzi w tryb tylko do odczytu i nadal możesz wyeksportować
            swoje Dane Usługobiorcy (na żądanie pomożemy). Usuwamy je, gdy usuniesz swoje konto w aplikacji, lub w ciągu {RETENTION.deletionRequestDays} dni od
            pisemnego żądania wysłanego na adres <Ph>{COMPANY.privacyEmail}</Ph>; następnie są one usuwane z kopii zapasowych w miarę ich wygasania, jak opisano w
            naszej <Link href="/privacy#retention">Polityce prywatności</Link>.
          </li>
          <li>
            Postanowienia, które ze swej natury powinny obowiązywać nadal (takie jak należne płatności, wyłączenia gwarancji, ograniczenie odpowiedzialności i
            zwolnienie z odpowiedzialności), pozostają w mocy po rozwiązaniu umowy.
          </li>
        </ul>
      </Section>

      <Section item={S.warranties} n={n(S.warranties)}>
        <p>
          Będziemy świadczyć Usługę z należytą starannością i zgodnie z naszą dokumentacją. Poza tym, w najszerszym zakresie dozwolonym przez prawo, Usługa jest
          świadczona w stanie „takim, w jakim jest” i „w miarę dostępności”, a my wyłączamy wszelkie inne gwarancje, wyraźne lub dorozumiane, w tym gwarancje
          przydatności handlowej, przydatności do określonego celu, tytułu prawnego i nienaruszania praw. Nie gwarantujemy, że Usługa będzie wolna od błędów i
          przerw ani że przedmiary, kosztorysy{AI_ENABLED ? ", wyniki AI" : ""} lub pomiary wyliczone na podstawie skali planu będą dokładne. Odpowiadasz za
          sprawdzenie ilości i cen, zanim zaczniesz na nich polegać.
        </p>
        <p>
          Northpin jest narzędziem do Twojej własnej pracy. Nie udziela porad inżynieryjnych, projektowych, dotyczących zgodności z przepisami technicznymi,
          ochrony przeciwpożarowej i bezpieczeństwa życia, podatkowych ani prawnych i nic w nim nie zastępuje takich porad.
        </p>
      </Section>

      <Section item={S.liability} n={n(S.liability)}>
        <p>W najszerszym zakresie dozwolonym przez prawo:</p>
        <ul>
          <li>
            żadna ze stron nie ponosi odpowiedzialności za szkody pośrednie, przypadkowe, szczególne, wynikowe ani karne, ani za utracone zyski, przychody,
            renomę lub dane (z wyjątkiem naszego obowiązku przywrócenia danych z naszych kopii zapasowych, o ile są dostępne), nawet jeśli została poinformowana o
            możliwości ich wystąpienia; oraz
          </li>
          <li>
            łączna odpowiedzialność każdej ze stron wynikająca z niniejszych Warunków lub z nimi związana jest ograniczona do kwot zapłaconych nam przez Ciebie za
            Usługę w ciągu 12 miesięcy poprzedzających zdarzenie będące podstawą roszczenia (lub do 100 USD, jeśli niczego nie zapłaciłeś(-aś)).
          </li>
        </ul>
        <p>
          Ograniczenia te nie mają zastosowania do Twoich zobowiązań płatniczych, do zobowiązań którejkolwiek ze stron w zakresie zwolnienia z odpowiedzialności
          ani do odpowiedzialności, której nie można ograniczyć zgodnie z prawem.
        </p>
      </Section>

      <Section item={S.indemnity} n={n(S.indemnity)}>
        <p>
          Będziesz bronić Northpin i zwolnisz go z odpowiedzialności w przypadku roszczeń osób trzecich wynikających z Danych Usługobiorcy, Twojej pracy na rzecz
          Twoich Klientów lub korzystania przez Ciebie z Usługi z naruszeniem niniejszych Warunków lub prawa. My będziemy bronić Ciebie i zwolnimy Cię z
          odpowiedzialności w przypadku roszczeń osób trzecich, że Usługa, w postaci, w jakiej ją świadczymy, narusza ich prawa własności intelektualnej. Strona
          żądająca zwolnienia z odpowiedzialności musi niezwłocznie powiadomić drugą stronę, pozwolić jej kierować obroną i rozsądnie z nią współpracować.
        </p>
      </Section>

      <Section item={S.law} n={n(S.law)}>
        <p>
          Niniejsze Warunki podlegają prawu stanu <Ph>{COMPANY.state}</Ph> oraz właściwemu prawu federalnemu USA, z wyłączeniem norm kolizyjnych. Wyłączna
          jurysdykcja przysługuje sądom stanowym i federalnym z siedzibą w <Ph>{COMPANY.county}</Ph>, <Ph>{COMPANY.state}</Ph>, a obie strony poddają się ich
          jurysdykcji. Przed wniesieniem powództwa każda ze stron zobowiązuje się podjąć próbę polubownego rozwiązania sporu, kontaktując się z drugą stroną i
          prowadząc negocjacje w dobrej wierze przez 30 dni.
        </p>
      </Section>

      <Section item={S.apple} n={n(S.apple)}>
        <p>Jeśli korzystasz z aplikacji Northpin na iOS pobranej z Apple App Store, zastosowanie mają również następujące postanowienia:</p>
        <ul>
          <li>
            Niniejsze Warunki wiążą wyłącznie Ciebie i Northpin, a nie Apple. Wyłączną odpowiedzialność za aplikację i jej zawartość ponosi Northpin, a nie Apple.
          </li>
          <li>
            Twoja licencja na korzystanie z aplikacji jest ograniczona do urządzeń marki Apple, które posiadasz lub kontrolujesz, zgodnie z zasadami korzystania z
            App Store.
          </li>
          <li>Apple nie ma obowiązku zapewniania konserwacji ani wsparcia technicznego dla aplikacji.</li>
          <li>
            Jeśli aplikacja nie spełnia warunków jakiejkolwiek obowiązującej gwarancji, możesz powiadomić o tym Apple, a Apple zwróci cenę zakupu (jeśli ją
            uiszczono). W najszerszym zakresie dozwolonym przez prawo Apple nie ma żadnych innych zobowiązań gwarancyjnych w odniesieniu do aplikacji.
          </li>
          <li>
            Za rozpatrywanie wszelkich roszczeń dotyczących aplikacji odpowiada Northpin, a nie Apple, w tym roszczeń z tytułu odpowiedzialności za produkt,
            roszczeń, że aplikacja nie spełnia wymogów prawnych lub regulacyjnych, roszczeń z zakresu ochrony konsumentów lub prywatności oraz roszczeń, że narusza
            ona własność intelektualną osób trzecich.
          </li>
          <li>
            Potwierdzasz, że nie przebywasz w kraju objętym embargiem USA i nie figurujesz na żadnej liście podmiotów zakazanych lub objętych ograniczeniami
            prowadzonej przez rząd USA.
          </li>
          <li>
            Apple i jego spółki zależne są beneficjentami niniejszych Warunków jako osoby trzecie i mogą dochodzić ich wykonania wobec Ciebie w zakresie, w jakim
            dotyczą one aplikacji na iOS.
          </li>
        </ul>
      </Section>

      <Section item={S.changes} n={n(S.changes)}>
        <p>
          Możemy aktualizować niniejsze Warunki wraz z rozwojem Usługi. Jeśli zmiana będzie istotna, poinformujemy Cię o niej e-mailem lub w aplikacji co najmniej
          30 dni przed jej wejściem w życie. Jeśli nie zgadzasz się ze zmianą, możesz anulować subskrypcję przed jej wejściem w życie; dalsze korzystanie z Usługi
          po tym terminie oznacza akceptację zmiany.
        </p>
      </Section>

      <Section item={S.general} n={n(S.general)}>
        <ul>
          <li>
            Nie możesz przenieść niniejszych Warunków bez naszej zgody, z wyjątkiem przeniesienia na następcę prawnego Twojego przedsiębiorstwa. My możemy je
            przenieść w ramach połączenia, przejęcia lub sprzedaży aktywów.
          </li>
          <li>Żadna ze stron nie odpowiada za opóźnienia spowodowane zdarzeniami pozostającymi poza jej uzasadnioną kontrolą.</li>
          <li>
            Jeśli którekolwiek postanowienie niniejszych Warunków okaże się niewykonalne, pozostałe pozostają w mocy. Niewykonanie prawa nie oznacza zrzeczenia się
            go.
          </li>
          <li>Możemy wysyłać zawiadomienia na adres e-mail przypisany do Twojego konta. Ty możesz wysyłać zawiadomienia na adres podany poniżej.</li>
          <li>
            Jesteśmy niezależnymi kontrahentami. Niniejsze Warunki stanowią całość porozumienia dotyczącego Usługi i zastępują wszelkie wcześniejsze umowy w tym
            zakresie.
          </li>
          <li>Korzystając z Usługi, będziesz przestrzegać przepisów USA dotyczących kontroli eksportu i sankcji.</li>
        </ul>
      </Section>

      <Section item={S.contact} n={n(S.contact)}>
        <p>
          <Ph>{COMPANY.legalName}</Ph>
          <br />
          <Ph>{COMPANY.address}</Ph>
          <br />
          <Ph>{COMPANY.contactEmail}</Ph>
        </p>
      </Section>
    </>
  ),
};

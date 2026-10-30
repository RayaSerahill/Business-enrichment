# Business-enrichment

Pieni palvelu, joka ottaa vastaan CSV-tiedoston suomalaisista yrityksistä (Y-tunnuksia, nimiä tai
molempia), hakee yritykset PRH:n avoimesta YTJ-rajapinnasta ja palauttaa:

- normalisoidun `company`-näkymän rekisterin tiedoista,
- `customer`-tietueen, joka on valmis tuotavaksi asiakasrekisteriin, esimerkiksi NetSuiteen,
- jokaiselle syöteriville yksiselitteisen tilan, virheet ja varoitukset alkuperäisessä
  rivijärjestyksessä.

Teknologiat: Node.js 22+, TypeScript, Fastify, csv-parse, natiivi `fetch`, zod, Vitest, ESLint ja
Prettier.

## Miten ratkaisu ajetaan

```bash
npm install
npm run dev
```

Palvelin kuuntelee osoitteessa `http://localhost:3000`. Lähetä sille esimerkkitiedosto:

```bash
curl -X POST http://localhost:3000/enrichment \
  -H 'Content-Type: text/csv' \
  --data-binary @examples/sample-companies.csv
```

Muut skriptit:

| Komento                      | Mitä tekee                                                           |
| ---------------------------- | -------------------------------------------------------------------- |
| `npm test`                   | Yksikkö- ja HTTP-testit (ei verkkoyhteyttä, PRH korvataan testeissä) |
| `npm run check`              | Tyyppitarkistus, lint, muotoilun tarkistus ja testit                 |
| `npm run build && npm start` | Kääntää `dist/`-hakemistoon ja käynnistää käännetyn palvelimen       |
| `npm run format`             | Muotoilee koodin Prettierillä                                        |

Asetukset luetaan ympäristömuuttujista, ja zod validoi ne käynnistyksessä:

| Muuttuja          | Oletus                                         |
| ----------------- | ---------------------------------------------- |
| `PORT`            | `3000`                                         |
| `HOST`            | `0.0.0.0`                                      |
| `LOG_LEVEL`       | `info`                                         |
| `MAX_ROWS`        | `1000`                                         |
| `PRH_BASE_URL`    | `https://avoindata.prh.fi/opendata-ytj-api/v3` |
| `PRH_TIMEOUT_MS`  | `10000`                                        |
| `PRH_MAX_RETRIES` | `2`                                            |
| `PRH_CONCURRENCY` | `2`                                            |

## Rajapinta

### `POST /enrichment`

Pyynnön runko: itse CSV-tiedosto, `Content-Type: text/csv`.

- Otsikkorivi vaaditaan. Sarakkeiden nimet tunnistetaan kirjainkoosta ja välimerkeistä
  riippumatta:
  - Y-tunnus: `businessId`, `business_id`, `Business ID`, `Y-tunnus`, `ytunnus`
  - Nimi: `name`, `companyName`, `company`, `nimi`, `yritys`, `Yrityksen nimi`, `toiminimi`
  - Muut sarakkeet ohitetaan. Ainakin toisen näistä kahdesta on oltava mukana.
- Erotinmerkki päätellään otsikkorivistä (`,`, `;` tai sarkain), koska suomenkielisen Excelin
  CSV-viennit käyttävät puolipistettä. UTF-8 BOM ja CRLF-rivinvaihdot toimivat.
- Tyhjät rivit ohitetaan. Vastauksen `row` on tiedoston rivinumero (otsikkorivi on rivi 1), jotta
  rivin löytää helposti Excelistä.

Vastaukset:

- `200`, jossa on yhteenveto ja yksi tulos jokaista riviä kohden. Epäonnistuneet rivit eivät kaada
  koko pyyntöä.
- `400`, jos CSV:tä ei voi jäsentää, odotetut sarakkeet puuttuvat tai rivejä on enemmän kuin
  `MAX_ROWS`.
- `415` muille sisältötyypeille.

### `GET /health`

Palauttaa `{ "status": "ok" }`.

### Vastauksen rakenne

Jokaisella tuloksella on samat avaimet. Kentät, jotka eivät koske riviä, ovat `null` tai tyhjiä
taulukoita. Alla on lyhennetty esimerkki esimerkkitiedostolle (2 sen 40 tuloksesta). Yritystiedot
ovat oikeista PRH:n vastauksista, jotka on tallennettu hakemistoon `tests/fixtures`. Kuvaukset ja
virheilmoitukset ovat englanniksi, koska palvelu palauttaa ne niin.

```json
{
  "summary": { "total": 40, "matched": 28, "notFound": 2, "ambiguous": 5, "failed": 5 },
  "results": [
    {
      "row": 2,
      "status": "matched",
      "input": { "businessId": "0112038-9", "name": "Nokia Oyj" },
      "company": {
        "businessId": "0112038-9",
        "name": "Nokia Oyj",
        "legalForm": { "code": "OYJ", "description": "Public limited company" },
        "industry": { "code": "70100", "description": "Activities of head offices" },
        "address": {
          "street": "Karakaari 7",
          "postOfficeBox": null,
          "careOf": null,
          "postCode": "02610",
          "city": "ESPOO",
          "country": null
        },
        "postalAddress": {
          "street": null,
          "postOfficeBox": "226",
          "careOf": null,
          "postCode": "00045",
          "city": "NOKIA GROUP",
          "country": null
        },
        "website": "www.nokia.com",
        "registrationDate": "1896-12-19",
        "endDate": null,
        "tradeRegisterStatus": "registered",
        "businessIdStatus": "valid",
        "situations": [],
        "vatRegistered": true,
        "isActive": true
      },
      "customer": {
        "externalId": "FI-0112038-9",
        "entityType": "COMPANY",
        "companyName": "Nokia Oyj",
        "businessId": "0112038-9",
        "vatRegNumber": "FI01120389",
        "url": "www.nokia.com",
        "isInactive": false,
        "creditHoldOverride": "AUTO",
        "address": {
          "attention": null,
          "addr1": "Karakaari 7",
          "zip": "02610",
          "city": "ESPOO",
          "country": "FI"
        },
        "billingAddress": {
          "attention": null,
          "addr1": "PL 226",
          "zip": "00045",
          "city": "NOKIA GROUP",
          "country": "FI"
        },
        "customFields": {
          "legalForm": "OYJ",
          "industryCode": "70100",
          "industryDescription": "Activities of head offices"
        }
      },
      "candidates": [],
      "errors": [],
      "warnings": []
    },
    {
      "row": 33,
      "status": "ambiguous",
      "input": { "businessId": null, "name": "Delta Auto Oy" },
      "company": null,
      "customer": null,
      "candidates": [
        {
          "businessId": "0872076-6",
          "name": "Hedin Automotive Retail Oy",
          "legalForm": "OY",
          "city": "JOENSUU",
          "isActive": true
        }
      ],
      "errors": [
        {
          "code": "NO_EXACT_NAME_MATCH",
          "message": "PRH returned 1 company for \"Delta Auto Oy\" but none is currently registered under exactly this name"
        }
      ],
      "warnings": []
    }
  ]
}
```

### Tilat

| Tila             | Merkitys                                                                 | Yhteenvedon avain |
| ---------------- | ------------------------------------------------------------------------ | ----------------- |
| `matched`        | Täsmälleen yksi yritys tunnistettu. `company` ja `customer` on täytetty. | `matched`         |
| `ambiguous`      | PRH palautti ehdokkaita, mutta yhtäkään ei voi hyväksyä automaattisesti. | `ambiguous`       |
| `not_found`      | PRH ei palauttanut mitään Y-tunnuksella tai nimellä.                     | `notFound`        |
| `invalid_input`  | Virheellinen Y-tunnus tai tyhjä rivi. PRH:ta ei kutsuttu.                | `failed`          |
| `upstream_error` | PRH:hon ei saatu yhteyttä tai se vastasi odottamattomasti.               | `failed`          |

Virheet kertovat, miksi rivillä ei ole osumaa. Varoitukset tulevat osuman mukana ja nostavat esiin
asioita, jotka ihmisen kannattaa tarkistaa ennen tuontia.

| Virhekoodi              | Milloin                                                                    |
| ----------------------- | -------------------------------------------------------------------------- |
| `MISSING_INPUT`         | Rivillä ei ole Y-tunnusta eikä nimeä                                       |
| `INVALID_BUSINESS_ID`   | Väärä muoto tai tarkistusnumero ei täsmää                                  |
| `BUSINESS_ID_NOT_FOUND` | Kelvollinen Y-tunnus, jota PRH ei tunne                                    |
| `NAME_NOT_FOUND`        | Nimihaku ei palauttanut yhtään yritystä                                    |
| `MULTIPLE_NAME_MATCHES` | Usealla yrityksellä on tällä hetkellä täsmälleen tämä nimi                 |
| `NO_EXACT_NAME_MATCH`   | PRH palautti yrityksiä, mutta yhdelläkään ei ole nyt täsmälleen tätä nimeä |
| `TOO_MANY_RESULTS`      | Yli 500 tulosta, joten palvelu ei voi varmistaa osuman yksikäsitteisyyttä  |
| `PRH_UNAVAILABLE`       | Verkkovirhe, aikakatkaisu tai HTTP 5xx uudelleenyritysten jälkeen          |
| `PRH_RATE_LIMITED`      | HTTP 429 uudelleenyritysten jälkeen                                        |
| `PRH_REQUEST_REJECTED`  | Muu PRH:n palauttama HTTP 4xx                                              |
| `PRH_INVALID_RESPONSE`  | PRH:n vastaus ei vastaa odotettua skeemaa                                  |

| Varoituskoodi               | Milloin                                                                     |
| --------------------------- | --------------------------------------------------------------------------- |
| `NAME_MISMATCH`             | Syötteen nimi ei ole mikään yrityksen rekisteröidyistä nimistä              |
| `NAME_FORMER_OR_AUXILIARY`  | Syötteen nimi on yrityksen aiempi nimi tai aputoiminimi                     |
| `DUPLICATE_BUSINESS_ID`     | Sama Y-tunnus esiintyi jo aiemmalla rivillä                                 |
| `COMPANY_INACTIVE`          | Lakannut, toiminta päättynyt, poistettu rekisteristä tai Y-tunnus mitätöity |
| `COMPANY_IN_BANKRUPTCY`     | Voimassa oleva konkurssimerkintä                                            |
| `COMPANY_IN_LIQUIDATION`    | Voimassa oleva selvitystilamerkintä                                         |
| `COMPANY_IN_REORGANISATION` | Voimassa oleva yrityssaneerausmerkintä                                      |

## Tunnistussäännöt

| Tilanne               | Toiminta                                        | Perustelu                                                    |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| Kelvollinen Y-tunnus  | Haku tarkalla tunnuksella                       | Luotettavin tunniste                                         |
| Pelkkä nimi           | Haku nimellä                                    | Tehtävänanto vaatii                                          |
| Sekä tunnus että nimi | Haku tunnuksella, sitten nimen vertailu         | Paljastaa ristiriitaisen lähdedatan                          |
| Useita nimiosumia     | `ambiguous` ja ehdokkaat                        | Estää väärän asiakkaan tuonnin                               |
| Ei osumaa             | `not_found`                                     | Erotetaan PRH:n virhetilanteista                             |
| Virheellinen Y-tunnus | `invalid_input`, ei PRH-kutsua                  | Ei turhia rajapintakutsuja eikä arvailua                     |
| Toistuvat Y-tunnukset | Yksi haku, kaikki rivit säilyvät, varoitus      | Tehokas, ja jokainen syöterivi pysyy jäljitettävänä          |
| PRH ei vastaa         | `upstream_error` vain riveille, joita se koskee | Tarkka tieto virheestä, muu tiedosto käsitellään normaalisti |
| Osoite puuttuu        | `null`                                          | Rekisteritietoja ei koskaan keksitä                          |

Säännöt tarkemmin:

1. **Tarkka Y-tunnusosuma on ratkaiseva.** Jos syötteen nimi ei täsmää, rivi on silti `matched`, ja
   mukana on `NAME_MISMATCH`- tai `NAME_FORMER_OR_AUXILIARY`-varoitus.
2. **Yksikäsitteinen nykyinen nimi hyväksytään.** "Nykyinen nimi" tarkoittaa PRH:n nimityyppiä 1
   (toiminimi) tai 2 (rinnakkaistoiminimi, esim. `Nokia Corporation`), jonka `version` on 1.
   Aiemmat nimet (`version` > 1) ja aputoiminimet (tyyppi 3) eivät kelpaa pelkän nimen perusteella
   tehtävään tunnistukseen.
3. **Nimiä verrataan vain normalisoinnin jälkeen:** Unicode NFC, reunojen välilyönnit poistettu,
   toistuvat välilyönnit yhdistetty ja kirjainkoko ohitettu suomen kielen säännöillä.
   `stora  enso OYJ` vastaa nimeä `Stora Enso Oyj`, mutta `Kamux` ei vastaa nimeä `Kamux Oyj`.
4. **Useat uskottavat osumat menevät käsin tarkistettaviksi.** Kun PRH palauttaa ehdokkaita, mutta
   yksikään ei täytä sääntöä 2, rivi on `ambiguous`, ja siinä on enintään 10 ehdokasta toiminnassa
   olevat ensin. `not_found` annetaan vain, kun PRH ei palauta mitään.
5. **Toiminnassa oleva voittaa lakanneen.** Suomessa toiminimi vapautuu, kun yritys lakkaa. Jos
   toiminnassa olevalla ja lakanneella yrityksellä on sama nimi, toiminnassa oleva hyväksytään.
6. **Yksikäsitteisyys tarkistetaan kaikilta tulossivuilta.** Nimihaku seuraa PRH:n sivutusta
   (enintään 5 sivua). Yksi osuma ensimmäisellä sivulla ei todista yksikäsitteisyyttä, jos toisella
   sivulla voi olla toinen.
7. **Sumea vertailu ja luotettavuuspisteytys jätettiin myöhemmäksi** (ks. alempana).

## Asiakasmappaus ja sen perustelut

`company` on uskollinen, normalisoitu kopio siitä, mitä PRH kertoo. `customer` on kohdejärjestelmän
tietue, ja vain siinä on tuontiin liittyvää liiketoimintalogiikkaa. Jos asiakasrekisteri vaihtuu,
vain `customer.mapper.ts` muuttuu. Kenttien nimet noudattavat NetSuiten customer-tietuetta silloin,
kun vastaava kenttä on olemassa. Tietue muodostetaan vain `matched`-riveille.

| Asiakaskenttä                   | Lähde                                                                                                  | Perustelu                                                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `externalId`                    | `FI-` + Y-tunnus                                                                                       | Pysyvä upsert-avain. Saman tiedoston tuominen uudelleen päivittää asiakkaat eikä luo kaksoiskappaleita. Maaetuliite jättää tilaa ulkomaisten rekisterien tunnuksille myöhemmin.                         |
| `entityType`                    | vakio `COMPANY`                                                                                        | Kyse on yritysasiakkaista (NetSuitessa `isPerson = false`).                                                                                                                                             |
| `companyName`                   | PRH:n nykyinen virallinen nimi                                                                         | Rekisteri on ratkaiseva. Syötteen nimet ovat usein lyhennettyjä tai vanhentuneita (`Delta Auto Oy` → `Hedin Automotive Retail Oy`).                                                                     |
| `businessId`                    | Y-tunnus                                                                                               | Tarvitaan suomalaisissa B2B-laskuissa, ja se on luonteva hakuavain.                                                                                                                                     |
| `vatRegNumber`                  | `FI` + Y-tunnuksen numerot                                                                             | Vain, jos PRH:n mukaan yrityksellä on voimassa oleva merkintä arvonlisäverorekisterissä. Jos ALV-numero johdettaisiin yritykselle, joka ei ole rekisterissä, laskulle päätyisi virheellinen ALV-numero. |
| `url`                           | verkkosivu                                                                                             | Suoraan rekisteristä.                                                                                                                                                                                   |
| `isInactive`                    | `!company.isActive`                                                                                    | Lakanneetkin yritykset voi tuoda, jolloin vanhat kaupat pysyvät linkitettävinä, mutta niitä ei voi käyttää uusiin myynteihin.                                                                           |
| `creditHoldOverride`            | `ON`, jos yritys on lakannut tai konkurssissa, selvitystilassa tai yrityssaneerauksessa, muuten `AUTO` | Autokaupoissa on usein mukana laskutusta tai rahoitusta, joten konkurssissa oleva yritys ei saa luottoa oletuksena. Tämä on liiketoimintalinjaus, ja sitä on helppo muuttaa.                            |
| `address`                       | käyntiosoite, muuten postiosoite                                                                       | Käyntiosoite, jota käytetään esimerkiksi auton luovutukseen.                                                                                                                                            |
| `billingAddress`                | postiosoite, muuten käyntiosoite                                                                       | PRH:n postiosoite on se, johon yritys haluaa postinsa, joten laskut menevät sinne.                                                                                                                      |
| osoitekentät                    | `addr1`, `zip`, `city`, `country`, `attention`                                                         | NetSuiten osoitekirjan kentät. Postilokero muotoillaan `PL 226`. `country` on oletuksena `FI`, koska PRH jättää maan tyhjäksi kotimaisissa osoitteissa.                                                 |
| `customFields.legalForm`        | PRH:n yritysmuoto, esim. `OYJ`                                                                         | NetSuitessa ei ole sille vakiokenttää. Hyödyllinen segmentointiin ja luottopäätöksiin.                                                                                                                  |
| `customFields.industryCode/...` | TOL 2008 -päätoimiala                                                                                  | Segmentointi, esim. leasingyhtiöt, jälleenmyyjät ja kalustoasiakkaat.                                                                                                                                   |

Tarkoituksella mappaamatta jätetyt kentät: tytäryhtiö (subsidiary), myyjä, maksuehdot, valuutta,
yhteyshenkilöt, sähköposti ja puhelin. Niitä ei ole PRH:ssa, ja tuova organisaatio päättää ne itse.

Ehdotettu tuontikäytäntö: varoituksettomat `matched`-rivit tuodaan automaattisesti, ja varoitukselliset
rivit sekä kaikki `ambiguous`-rivit ohjataan ihmisen tarkistettaviksi.

## Mitä esimerkkitiedosto näyttää

[`examples/sample-companies.csv`](examples/sample-companies.csv) sisältää 40 riviä oikeita
suomalaisia yrityksiä, jotka on valittu niin, että jokainen haara tulee käytyä läpi.

Tulossarake kertoo, mitä palvelun pitäisi palauttaa niiden PRH-tietojen perusteella, joita
tarkastelin palvelua rakentaessani. Rivit 2–20, 28–29 ja 37–41 varmistettiin ajossa oikeaa
rajapintaa vasten. Ajo keskeytyi, kun PRH alkoi hylätä yhteydet IP-osoitteestani (ks. alempana),
joten muita rivejä ei ole varmistettu päästä päähän, eikä tallennettua tulostiedostoa ole mukana.

| Rivit | Syöte                                                                                                                   | Odotettu tulos                                                   |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 2–13  | Y-tunnus + oikea nimi (mukana autoliikkeet Veho, Kamux ja Toyota)                                                       | `matched`                                                        |
| 14–16 | Pelkkä Y-tunnus                                                                                                         | `matched`                                                        |
| 17–20 | Pelkkä täsmälleen oikea nykyinen nimi                                                                                   | `matched`                                                        |
| 21    | Stora Enson Y-tunnus ja nimi `stora  enso OYJ` (poikkeava kirjainkoko ja välistys)                                      | `matched`, ei varoitusta                                         |
| 22    | Y-tunnus, jonka ympärillä on välilyöntejä                                                                               | `matched`                                                        |
| 23    | Sanoman Y-tunnus ja nimi `Alma Media Oyj`                                                                               | `matched` + `NAME_MISMATCH`                                      |
| 24    | Hedinin Y-tunnus ja sen aiempi nimi `Delta Auto Oy`                                                                     | `matched` + `NAME_FORMER_OR_AUXILIARY`                           |
| 25    | Kamux Oyj:n Y-tunnus ja epämääräinen nimi `Kamux`                                                                       | `matched` + `NAME_MISMATCH`                                      |
| 26    | Premium Car Center Oy                                                                                                   | `matched` + `COMPANY_IN_BANKRUPTCY`, ei ALV-numeroa, luottoesto  |
| 27    | Valiopyörä Oy, lakannut 2004                                                                                            | `matched` + `COMPANY_INACTIVE`, `address: null`                  |
| 28–29 | Toistuvat Y-tunnukset (toisessa nimi isoilla kirjaimilla)                                                               | `matched` + `DUPLICATE_BUSINESS_ID`, ei ylimääräisiä PRH-kutsuja |
| 30–34 | Epämääräiset nimet `Valio`, `Kesko` ja `Laakkonen` sekä aiemmat nimet `Wetteri Oy` ja `Delta Auto Oy`                   | `ambiguous` ja ehdokkaat                                         |
| 35    | `Olematon Autoliike Oy`                                                                                                 | `not_found`                                                      |
| 36    | `1234567-1`: kelvollinen tarkistusnumero, mutta ei rekisterissä                                                         | `not_found`                                                      |
| 37–40 | Väärä tarkistusnumero, ALV-numeron muoto, puuttuva tarkistusnumero ja numero, jolle ei ole kelvollista tarkistusnumeroa | `invalid_input`                                                  |
| 41    | Tyhjä rivi                                                                                                              | `invalid_input`                                                  |

## Oletukset

- **Syöte**: UTF-8-muotoinen CSV, jossa on otsikkorivi ja yksi yritys riviä kohden, kuten Excelistä
  tai CRM:stä viedyssä tiedostossa. Tiedostossa on kymmeniä tai satoja rivejä, joten synkroninen
  pyyntö riittää. Oletusraja on 1000 riviä.
- **Vain suomalaiset yritykset.** PRH on ainoa lähde, joten ulkomaiset yritykset on rajattu pois.
- **Kelvollinen Y-tunnus kertoo käyttäjän todellisen tarkoituksen.** Jos PRH ei tunne tunnusta,
  rivi on `not_found` eikä nimihakuun siirrytä, koska nimihaku voisi huomaamatta valita eri
  yrityksen kuin sen, johon tunnus viittaa.
- **Virheellistä Y-tunnusta ei korjata**, vaikka rivillä olisi nimi (`FI01120389`, `1234567`).
  Tarkoitetun tunnuksen arvaaminen tai siirtyminen nimeen piilottaisi datan laatuongelman, joka
  käyttäjän pitäisi korjata lähteessä.
- **Rekisterin arvot palautetaan sellaisinaan kuin PRH ne tallentaa**: `ESPOO` isoilla kirjaimilla,
  `rajamaankaari` pienillä. Kosmeettinen muokkaus jätetään esityskerrokselle.
- **Englanninkieliset kuvaukset ovat ensisijaisia** yritysmuodolle ja toimialalle. Varalla ovat
  suomi ja sitten ruotsi.
- **Palvelu on sisäinen**, joten siinä ei ole tunnistautumista.
- **PRH:n data on lisensoitu CC BY 4.0 -lisenssillä.** Sisältää Patentti- ja rekisterihallituksen
  (PRH) YTJ-avoindataa.

## Päätökset

- **Pelkkä `text/csv`-runko multipart-latauksen sijaan.** Ei lisäriippuvuutta, toimii
  `curl --data-binary` -komennolla, ja käyttöliittymä voi lähettää tiedoston sisällön suoraan.
- **Yksi pyyntö, yksi kokonainen vastaus syötejärjestyksessä.** Rivit käsitellään rinnakkain, mutta
  jokainen tulos kirjoitetaan omalle paikalleen, joten `results[i]` vastaa aina syöteriviä `i`.
- **Haut deduplikoidaan erän sisällä.** Jokaista yksilöllistä Y-tunnusta tai normalisoitua nimeä
  kohden tehdään yksi PRH-kutsu. Toistuvat rivit saavat silti oman tuloksensa sekä
  `DUPLICATE_BUSINESS_ID`-varoituksen, jotta tuonti ei luo kahta asiakasta. Myös
  `externalId`-upsert-avain suojaa tältä.
- **Kohtelias PRH-asiakas**: enintään 2 samanaikaista pyyntöä, jaettuna kaikkien saapuvien
  pyyntöjen kesken (raja on PRH-asiakasluokassa, ei pyynnön käsittelijässä). 10 sekunnin
  aikakatkaisu. Kaksi uudelleenyritystä eksponentiaalisesti kasvavalla viiveellä verkkovirheille,
  429:lle ja 5xx:lle. Muita 4xx-vastauksia ei yritetä uudelleen.
- **PRH:n vastaukset validoidaan zodilla julkaistua OpenAPI-skeemaa vasten.** Skeemassa pakollisiksi
  merkityt kentät ovat pakollisia, valinnaiset saavat puuttua ja tuntemattomat kentät pudotetaan
  pois. Jos PRH muuttaa formaattiaan, rivit saavat `PRH_INVALID_RESPONSE`-virheen puolittain mapatun
  datan sijaan.
- **Virheet ovat rivikohtaisia.** Yksi epäonnistunut PRH-kutsu ei kaada tiedostoa. HTTP-tila kuvaa
  pyyntöä, ja jokaisella rivillä on oma tilansa.
- **`ambiguous` vs. `not_found`**: `not_found` on lopullinen (PRH ei palauttanut mitään).
  `ambiguous` tarkoittaa, että PRH palautti jotain ja ihmisen on valittava, ja mukana ovat ehdokkaat
  valintaa varten.
- **Koodit käännetään luettaviksi arvoiksi**: yritysmuoto `17` → `OYJ`, kaupparekisterin tila `4` →
  `ceased`, tilanne `KONK` → `bankruptcy`. Taulukot ovat PRH:n omista koodistoista
  (`/v3/description?code=YRMU|REK_KDI|STATUS3|SELTILA,SANE,KONK`).
- **Erilliset `company`- ja `customer`-oliot.** Normalisoitu rekisterinäkymä pysyy
  uudelleenkäytettävänä, ja CRM-kohtainen logiikka (luottoesto, osoitteiden roolit, ulkoisen
  tunnisteen muoto) on yhdessä mapperissa.

### PRH-rajapinnan havaittu käytös ja miten huomioin sen

- Nimihaku osuu osamerkkijonoihin, aiempiin nimiin ja aputoiminimiin. `Valio` palauttaa 124
  yritystä, joista moni on lakannut tai on nimeltään jotain aivan muuta.
- Sivunumerointi alkaa ykkösestä, ja sivulla voi olla alle 100 yritystä (`Valio`: 71 + 53), joten
  asiakas seuraa `totalResults`-arvoa eikä oleta sivukokoa.
- Tuntematon tai virheellinen `businessId` palauttaa `200` ja tyhjän listan, ei `404`:ää.
- Kehityksen aikaisen pyyntöryöpyn jälkeen (tutkivia kutsuja sekä erä neljällä rinnakkaisella
  pyynnöllä) PRH lakkasi joksikin aikaa hyväksymästä TCP-yhteyksiä IP-osoitteestani
  (`ECONNREFUSED`) sen sijaan, että olisi vastannut `429`. Siksi oletusrinnakkaisuus on 2,
  yhteysvirheet yritetään uudelleen viiveellä ja jokainen rivi raportoi `upstream_error`-tilan
  erikseen. En löytänyt todellisia rajoja dokumentoituna.
- Nimihaku `stora  enso OYJ` ei palauttanut mitään. Asiakas yhdistää nyt toistuvat välilyönnit
  ennen nimihaun lähettämistä. En ole tarkistanut, erotteleeko PRH:n nimihaku myös isot ja pienet
  kirjaimet.

## Mitä jätin tekemättä ja mitä tekisin seuraavaksi

Jätin tarkoituksella pois ajan takia:

- **Käyttöliittymä.** Seuraava askel olisi pieni React-näkymä: CSV:n pudotus, yhteenveto, suodatus
  tilan mukaan ja oikean ehdokkaan valinta `ambiguous`-riveille.
- **Sumea vertailu ja luotettavuuspisteet**: nimien vertailu ilman yritysmuotopäätteitä
  (`Kamux` ↔ `Kamux Oyj`, `Oy X Ab` ↔ `X Oy`), välimerkkien sekä suomen- ja ruotsinkielisten
  muotojen huomiointi ja samankaltaisuuspisteet jokaiselle ehdokkaalle. Huolimattomasti tehtynä tämä
  tuo vääriä asiakkaita, joten rinnalle tarvitaan tarkistusvaihe.
- **Lisäsarakkeiden käyttö tarkennukseen.** PRH tukee `location`-suodatinta, joten
  paikkakuntasarake ratkaisisi monta `ambiguous`-nimiriviä.
- **Vikasietoisuus ja välimuisti**: circuit breaker, jotta PRH:n katko johtaa nopeaan
  epäonnistumiseen eikä jokaisen rivin uudelleenyrityksiin, sekä jaettu välimuisti (esim. Redis,
  noin vuorokauden TTL, `lastModified`-kentän avulla), koska rekisteritiedot muuttuvat hitaasti.
- **Suuret tiedostot**: asynkroniset työt (lataus → työn tunniste → tilan kysely tai webhook) ja
  CSV:n virtaava jäsennys.
- **Datan vienti rekisteriin**: NetSuiten CSV Import -tiedoston muodostus tai suora SuiteTalk REST
  -upsert `externalId`:n perusteella.
- **Operointi**: tunnistautuminen, tämän rajapinnan pyyntörajoitus, OpenAPI-dokumentaatio
  `@fastify/swagger`-kirjastolla, Dockerfile, metriikat ja öinen sopimustesti oikeaa PRH-rajapintaa
  vasten skeemamuutosten havaitsemiseksi.
- **Yleisten tunnusmuotojen korjaus** (`FI01120389`, puuttuva väliviiva) automaattisesti varoituksen
  kera, jos käyttäjät sitä toivovat.
- **Oikeaa rajapintaa vasten tehdyn varmistuksen viimeistely**: API-Rajapinta alkoi rate-limitoimoinaan 
  minua viimeisten testien aikana, `examples/sample-output.json` sisältää siis 13 virhettä jotka tulee
  time-out syistä

## Miten käytin tekoälytyökaluja

Rakensin tämän itsenäisesti pienellä avulla claudelta

- **Clauden osuus:** se tutki oikeaa PRH-rajapintaa (OpenAPI-skeema osoitteessa
  `/v3/schema?lang=en`, koodistot osoitteessa `/v3/description`, oikeat vastaukset, sivutus ja
  virhetilanteet), jotta zod-skeema ja koodimappaukset vastaavat todellisuutta. Se valitsi oikeat
  yritykset esimerkki-CSV:hen ja kirjoitti tämän README:n palautus ajan loppuessa (sain tehtävän
  annon 2 päivää ennen sen palautusta ja hyvän dokumentaation kirjoittaminen ei mahtunut vapaa-ajan 
  aikatauluun).
# AR Studio

[Otwórz AR Studio](https://k3dzi0r.github.io/ar-studio/)

WebAR: obraz = znacznik, bez QR. Kreator → biblioteka → skaner. Wszystko lokalnie (IndexedDB), bez serwera.

## Uruchomienie

```bash
npm install --ignore-scripts   # mind-ar ciągnie natywny pakiet `canvas`, którego nie potrzebujemy w przeglądarce
npm run dev                    # HTTPS (self-signed) na https://<IP-w-LAN>:5173 — wymagane do kamery na telefonie
npm test && npm run build
```

Telefon: otwórz adres `https://<IP komputera>:5173`, zaakceptuj certyfikat. `localhost` działa bez HTTPS.

## PWA i offline

Po pierwszym załadowaniu service worker zapisuje całą aplikację (~2,2 MB) i działa bez internetu; karty są w IndexedDB. Aktualizacje pobierają się same. Instalacja: przycisk „Zainstaluj aplikację" (Android/Chrome/desktop) lub Udostępnij → Dodaj do ekranu głównego (iOS). Aplikacja prosi też przeglądarkę o trwały magazyn, by biblioteka nie została usunięta przy braku miejsca. Service worker działa tylko po HTTPS lub na `localhost`; sprawdzenie offline: `npm run build && npm run preview`.

## Wbudowane kolekcje

`public/library/*.arpack` + `index.json`: Kosmos (4), Kształty (3), Emocje (4), Zwierzęta (4). Użytkownik dodaje je z biblioteki („Dodaj i skanuj"), drukuje karty (`Drukuj`) i skanuje. Paczki pobierają się raz i są cache'owane do pracy offline. Odświeżone kolekcje zachowują dotychczasowe znaczniki. Przycisk „Dodaj odświeżoną wersję” dodaje nową kolekcję i wyłącza poprzednią w skanerze, zachowując jej karty.

Tekstury Słońca, Ziemi, Księżyca i Saturna pochodzą z [Solar System Scope](https://www.solarsystemscope.com/textures/) ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Zmniejszono je i osadzono w modelach GLB.
Są generowane programowo (`src/dev/`): grafiki kart, modele GLB, dźwięki WAV. Regeneracja (tylko dev): `NO_SSL=1 npm run dev`, otwórz `/#/dev/build-library`, „Generuj paczki" (~3 min; strona musi być widoczna). **Każda karta musi mieć unikalny wzór** — identyczne elementy graficzne na różnych kartach powodują fałszywe rozpoznania.

Kolekcja Zwierzęta wykorzystuje zdjęcia z Flickr oraz nagrania z Freesound na licencji CC0. Informacje o źródłach są zapisane w kartach i paczce.

## Przenoszenie własnych kart

W bibliotece wybierz „Eksportuj kartę” lub przefiltruj karty i kliknij „Eksportuj widoczne”. Na drugim urządzeniu wybierz „Importuj karty (.arpack)”, wskaż pobraną paczkę i włącz zaimportowaną kolekcję w skanerze. Paczka zawiera znaczniki, dane rozpoznawania i wszystkie pliki zawartości.

## Katalog zasobów w kreatorze

W kroku „Obraz do rozpoznawania” wybierz „Szukaj obrazu”, aby znaleźć znacznik w Openverse. Zawartość AR możesz dodać osobno przyciskiem „Szukaj w katalogu”. Modele z [Toy Car Kit](https://kenney.nl/assets/toy-car-kit) (Kenney, CC0) są dostępne offline po instalacji pamięci podręcznej PWA. Obrazy i dźwięki z [Openverse](https://api.openverse.org/v1/) wymagają internetu i są ograniczone do CC0 i domeny publicznej. Jeśli źródło blokuje pobranie w przeglądarce, otwórz link „Źródło” i wgraj pobrany plik ręcznie. Karta zapisuje pobrany plik lokalnie, razem z informacją o licencji i źródle.

## Architektura (`src/`)

- `core/recognition` — kompilacja obrazu → dane MindAR (w przeglądarce), ocena jakości, scalanie wielu znaczników.
- `core/render` — rejestr typów zawartości (`registerContentType`); `model3d.ts` (model GLB) i `media.ts` (obraz 2D, tekst, dźwięk, wideo). Nowy typ = nowy plik + wpis w `index.ts`.
- `core/storage` — IndexedDB (karty, pliki, kolekcje) + `pack.ts` (import/eksport `.arpack`, czyli zip z danymi rozpoznawania). Jedyne miejsce do podmiany pod synchronizację.
- `features/{library,editor,scanner}` — ekrany.

## Uwagi techniczne

- `three` jest przypięty do 0.160.x: MindAR 1.2.5 importuje `sRGBEncoding` (usunięte w three ≥ 0.162).
- Skaner ładuje tylko karty z aktywnych kolekcji; śledzi równocześnie max 3.

# Stok Takip — AI Kod Asistanı Rehberi

Bu dosya projeye yeni katılan bir yapay zekâ kod asistanına gerekli tüm bağlamı verir. Tüm arayüz metinleri, kod yorumları ve dokümantasyon **Türkçe**'dir; bu dosya da Türkçe tutulur.

## Expo SDK 57 uyarısı

Expo **SDK 57** kullanılır (React Native 0.86, React 19). Bu sürüm eğitim verilerinde bulunmayabilir; kod yazmadan önce sürüme özel dokümanı okuyun: https://docs.expo.dev/versions/v57.0.0/

## Proje genel bakış

İşletme yan satış ürünleri (motor yağı, antifriz vb.) için **stok ve vardiya takip** uygulaması. Backend olarak **Supabase** (PostgreSQL + Auth + Storage + Realtime) kullanılır; ayrıca bir sunucu kodu yoktur, tüm iş mantığı veritabanı tetikleyicileri ve RLS politikalarında yaşar.

İki kullanıcı rolü vardır (`src/lib/types.ts`):

- **admin**: Stok ekranı kağıt gibi iki sayfadır (üstte 1. Sayfa / 2. Sayfa seçimi; 2. sayfa o anki nöbetin pompa sayaçları + değişiklik geçmişi). 1. sayfa geniş ekranda iki sütundur: solda kağıt düzeninde stok tablosu (DEPO dahil), sağda seçilen günün/aralığın vardiyaları alt alta (kim, hangi yağdan kaç adet, ÇKN) ve ürün bazında satış özeti; dar ekranda Stok/Vardiyalar seçimiyle. Vardiyalar paneli kapatılabilir; tercih `AsyncStorage`'da kalır. Ürün CRUD (fotoğraf yok), Excel'den toplu ürün aktarımı, depoya/rafa alım, depodan rafa çıkış, raf/depo düzeltme, iade girişi, çalışan hesabı açma/silme, çalışana vardiya açma izni verme, herkes adına vardiya açma/kapatma, hareket geçmişi (birleşik filtreli akış), vardiya raporları ve canlı bildirimleri görür.
- **calisan**: Kullanıcı adıyla giriş yapar, takvimden nöbet gününü seçer ve nöbeti (vardiya) başlatır (profilde `can_open_shift` izni varsa; yoksa admin onun için açar). Nöbet, kağıt çizelgenin dijitalidir: 1. sayfa yağ satış listesi (ÇKN = depodan çıkış, satış ve iade; stok otomatik güncellenir), 2. sayfa pompa sayaçları. Stok sekmesi kağıttaki yağ listesi gibi tek satırlık tablodur (açık nöbetine göre ÇKN/DVR/SATIŞ/BAK); ürüne dokununca satış, ÇKN veya iade yapar. Ayrıca ortak not defterine tarihli not düşer, vardiya sonunda raf sayımı yapıp devreder. Sayım farkı admin paneline düşer.

## Teknoloji yığını

- **Expo SDK 57** + **expo-router** (dosya tabanlı yönlendirme; `typedRoutes` ve `reactCompiler` deneyleri açık)
- **React 19.2 / React Native 0.86**, TypeScript (`strict: true`)
- **@supabase/supabase-js** v2; oturum native'de `AsyncStorage`'a, web'de varsayılan depolamaya yazılır
- Geri bildirim: `expo-audio` (ses efektleri) + `expo-haptics` (titreşim)
- Web hedefi **statik export** (`app.json` → `web.output: "static"`, `baseUrl: /stok-takip`), GitHub Pages'e dağıtılır
- Android APK: EAS (`eas.json` → `preview` profili, `npx eas build -p android --profile preview`)

## Kurulum ve komutlar

```bash
npm install        # bağımlılıklar
npm start          # Expo dev sunucusu (Expo Go ile QR okutulur)
npm run web        # tarayıcıda çalıştır
npm run android    # Android emülatörü
npm run ios        # iOS simülatörü
npm run lint       # expo lint (not: repoda ESLint config dosyası yoktur; ilk çalıştırmada oluşturulur)
npm run deploy     # önce `expo export --platform web` (predeploy), sonra gh-pages ile dist/ yayını
npm run db:new -- <ad>  # supabase/migrations/<zaman>_<ad>.sql geçiş dosyası açar
npm run db:status  # yerel ve canlı geçiş listesi
npm run db:push    # eksik geçişleri canlı veritabanına uygular (önce bir kere `npx supabase login` + `link`)
```

Ortam değişkenleri (`.env.example`'dan kopyalanır, `.env` gitignore'dadır):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Bu iki değer yoksa uygulama `src/app/_layout.tsx` içinde kurulum ekranı gösterir. Ayrıntılı kurulum: **KURULUM.md** (Supabase projesi açma, CLI ile geçişleri uygulama, admin hesabı oluşturma adımları).

**Test altyapısı yoktur** — jest/vitest kurulu değildir ve repoda test dosyası yoktur. Doğrulama `npm run lint` ve manuel çalıştırmayla yapılır.

## Proje yapısı

```
src/
  app/                  # expo-router rotaları (src/app otomatik algılanır)
    _layout.tsx         # Kök: AuthProvider + Stack; .env kontrolü
    index.tsx           # Role göre yönlendirme (admin → (admin)/stok, calisan → (calisan)/nobet)
    login.tsx           # Kullanıcı adı/e-posta + şifre girişi
    (admin)/            # Admin sekmeleri: stok, hareketler, vardiyalar, bildirimler, calisanlar, notlar
                        # + href:null detay ekranları: urun, vardiya-detay, calisan-detay, aktar (Excel'den ürün aktarımı),
                        #   pompa (bir nöbetin 2. sayfası + değişiklik geçmişi)
    (calisan)/          # Çalışan sekmeleri: nobet (takvimden nöbet günü), vardiya, stok, hareketler (kendi hareketleri), notlar
                        # + cizelge (href:null, tab bar gizli): altta "1. Sayfa / 2. Sayfa" seçimli nöbet çizelgesi
  components/ui.tsx     # Tek dosyalık UI kiti: colors, Screen, Card, Button, Input,
                        # Badge, EmptyState, SectionTitle
  components/cizelge/   # Çizelge sayfaları: yag-satis-sayfasi (1. sayfa), pompa-sayfasi (2. sayfa; geniş ekranda
                        # sayaçlar solda, OTOMASYON/GÜN SONU/PMP sağda), pompa-gecmisi (admin: değişiklik geçmişi),
                        # admin-pompa (admin gözüyle 2. sayfa: Düzenle + geçmiş; stok ekranı ve pompa rotası ortak)
  components/stok-tablosu.tsx        # Stok ekranlarının kağıt düzenindeki tek satırlık tablosu
                                     # (FİYAT/ÇKN/DVR/SATIŞ/BAK, admin'de ek DEPO; fotoğraf yok)
  components/urun-islem-penceresi.tsx # Çalışan stok tablosunda ürüne dokununca: satış / ÇKN / iade
  components/vardiya-defteri.tsx     # Admin stok ekranının sağı: zaman filtresi, satılan ürünler,
                                     # nöbet başına kağıttaki pompacı blokları (ürüne dokun → o ürünü satan vardiyalar)
  components/zaman-filtresi.tsx      # Gün ‹ › / Son 7 gün / Bu ay / Tümü filtresi (vardiya defteri, vardiyalar)
  hooks/                # use-open-shift (açık vardiya), use-unread-notifications (realtime rozet)
  lib/
    alerts.ts           # Web uyumlu uyarı/onay diyalogları (showAlert/confirmAction)
    supabase.ts         # supabase istemcisi, isSupabaseConfigured, createTempAuthClient,
                        # toLoginEmail (kullanıcı adı → ad@personel.local)
    types.ts            # Alan adı tipleri (Profile, Product, Shift, StockMovement, ...)
                        # ve MOVEMENT_LABELS gibi Türkçe etiketler
    format.ts           # tr-TR para/adet/tarih/süre biçimleme + parseNumberInput ("12,5" → 12.5)
    feedback.ts         # Merkezi ses + titreşim geri bildirimi (feedback.sale/success/error/...)
    storage.ts          # Ürün fotoğrafı kovası adı (fotoğraf kaldırıldı; sadece eski fotoğrafı silerken)
    pompa.ts            # 2. sayfanın hortum listesi (yakıt + H.KODU), ek alanları ve STATION_NAME
    excel-aktarim.ts    # Excel'den yapıştırılan tabloyu (TSV) çözer: başlık algılama, TR sayı biçimi, stok kaynağı
    nobet-stok.ts       # Nöbetin yağ satış hesabı (OilRow: önceki/ÇKN/satış/BAK); çizelge ve stok ekranları ortak
    vardiya-defteri.ts  # Zaman aralığındaki nöbetlerin satış/ÇKN dökümü ve ürün bazında satış özeti
    cizelge-verisi.ts   # 2. sayfa okuma/kaydetme, önceki sayaçlar, değişiklik geçmişi (çalışan ve admin ortak)
  providers/
    auth-provider.tsx   # AuthProvider + useAuth (session, profile, signOut, refreshProfile)
supabase/
  config.toml           # Supabase CLI ayarı (`supabase init`); proje bağlantısı .temp/'te, gitignore'da
  migrations/           # Şemanın tek kaynağı, sırayla uygulanan Supabase CLI geçişleri:
    20260718215932_initial_schema.sql        # tablolar, stok tetikleyicisi, RLS
    20260718224258_admin_delete_employee.sql # çalışan silme RPC
    20260720120000_gelistirmeler.sql         # ürün fotoğrafı + bildirimler + realtime
    20260915120000_urun_silme.sql            # admin_delete_product RPC
    20260916120000_notlar_ve_vardiya_izni.sql # notes + can_open_shift + iade RLS'i
    20261026120000_gun_cizelgesi.sql         # shift_sheets (2. sayfa: pompa sayaçları, jsonb)
    20261028132804_depodan_cikis.sql         # 'cikis' hareket tipi (ÇKN), çalışan yazabilir
    20261028132805_urun_sirasi_ve_excel_aktarimi.sql # products.sort_order + admin_import_products RPC
    20261028182615_depo_stoku.sql            # products.depot_stock, stock_movements.depot_delta, 'depo_alim'
    20261030113802_pompa_degisiklik_gecmisi.sql # shift_sheet_changes: 2. sayfada kim hangi hücreyi değiştirdi (tetikleyici)
assets/                 # Görseller ve sesler (tap/success/sale/error .wav)
.github/workflows/deploy.yml  # master'a push'ta web export + GitHub Pages dağıtımı
```

`tsconfig.json` yol takma adı: `@/*` → `src/*`, `@/assets/*` → `assets/*`.

## Kodlama kuralları (projede yerleşik convention'lar)

- **Veri çekme**: Ekranlar supabase-js istemcisini doğrudan kullanır ve `useFocusEffect(useCallback(() => { load(); }, [load]))` kalıbıyla sekme odaklanınca yeniler. Liste ekranları `FlatList` + `refreshing/onRefresh` ile çekme-yenileme destekler. Canlı veri gereken yerde `supabase.channel('...').on('postgres_changes', ...)` kullanılır (ör. `useUnreadNotifications`, `bildirimler.tsx`).
- **Stil**: Her ekranda `StyleSheet.create`; renkler asla hardcode edilmez, hep `colors` (src/components/ui.tsx) üzerinden gelir. Tailwind/stil kütüphanesi yoktur. `Screen`/`Card`/`Button`/`Input` ortak bileşenleri kullanılır.
- **Türkçe sayı biçimi**: Para/adet gösterimi için `formatMoney`/`formatQty`, kullanıcı girdisi sayıya çevrilecekse `parseNumberInput` kullanılır (ondalık virgül kabul eder).
- **Geri bildirim**: Kullanıcı aksiyonlarında ve hatalarda `feedback` çağrılır (`press`, `tick`, `sale`, `success`, `error`, `warning`). Yeni buton/aksiyon eklerken bu convention korunur.
- **Hata/uyarı gösterimi**: `Alert.alert(...)` yerine web uyumlu `showAlert`/`confirmAction` (`src/lib/alerts.ts`) kullanılır — RN Web'de `Alert` sessizce yok sayılır ve kullanıcı geri bildirim görmez. Supabase hata mesajı 'Yetersiz stok' içeriyorsa Türkçeleştirilir.
- **Çalışan girişi**: Kullanıcı adı arka planda `kullaniciadi@personel.local` sahte e-postasına çevrilir (`toLoginEmail`). Yeni çalışan açarken **asla** ana `supabase` istemcisiyle `signUp` yapılmaz; admin oturumu ezilmesin diye `createTempAuthClient()` kullanılır (`calisanlar.tsx`).
- **Rol koruması**: Her route grubunun `_layout.tsx`'i oturum ve rol kontrolü yapar (`Redirect` ile yanlış rolden atar). Yeni sekme eklerken ilgili layout'a `Tabs.Screen` eklenir; detay sayfaları `href: null` ile sekmeden gizlenir.
- **Yorumlar Türkçe** yazılır ve "neden" bilgisini taşır (ör. `vardiya.tsx`'teki sayım doğrulaması yorumu).

## Veritabanı kuralları (kritik)

- **Stok asla doğrudan `products` üzerinden güncellenmez.** Tüm stok değişimleri `stock_movements` satırı eklenerek yapılır; `apply_stock_movement()` tetikleyicisi stoku atomik günceller ve eksiye düşerse `'Yetersiz stok'` hatasıyla işlemi geri alır. İki stok vardır: `products.stock` = dışarıdaki raf (pompacının sattığı, kağıttaki DVR/BAK), `products.depot_stock` = depo. Her hareket `delta` (raf) ve `depot_delta` (depo) taşır: `satis` → raf −qty; `alim`/`iade` → raf +qty; `depo_alim` → depo +qty; `cikis` (ÇKN) → depo −qty, raf +qty; `duzeltme` → ikisi de istemciden. Raf eksiye düşerse `'Yetersiz stok'`, depo eksiye düşerse `'Depoda yeterli ürün yok'` hatasıyla işlem geri alınır. `alim` geriye uyum için rafa yazar (eski sürümün "Stoka Ekle" düğmesi); satın alma normalde `depo_alim`'dir.
- **İstemci her zaman tipi Türkçe sabitlerle gönderir**: `'satis'`, `'alim'`, `'duzeltme'`, `'iade'`, `'cikis'`, `'depo_alim'` (bkz. `MovementType`). `cikis` = pompacının depodan dışarıdaki rafa çıkardığı (kağıttaki ÇKN). Hareket listelerinde miktar `movementEffect()` (format.ts) ile raf/depo ayrı gösterilir.
- Ürün listeleri kağıttaki sırayla gelir: `.order('sort_order', { ascending: true, nullsFirst: false }).order('name')`. `sort_order` Excel aktarımında satır sırasından yazılır.
- Toplu ürün aktarımı `admin_import_products(items jsonb)` RPC'siyle tek transaction'da yapılır; raf ve depo farkı ayrı `duzeltme` hareketleri (not: 'Excel aktarımı (raf/depo)') olarak yazılır, stok doğrudan güncellenmez. Excel'de `DEPO` sütunu varsa depo da aktarılır. Eşleştirme istemcide normalize adla (`normalizeKey`) yapılır.
- `shifts`: bir çalışanın aynı anda tek açık vardiyası olabilir (kısmi unique index). Vardiya açma: admin herkes adına açabilir/kapatabilir (`vardiyalar.tsx`); çalışan ancak `profiles.can_open_shift` true ise kendi vardiyasını açar (RLS `shifts_insert` politikasında zorlanır).
- `notes`: çalışanların ortak not defteri (kağıt defterin yerini alır). Herkes okur, herkes kendi adına yazar; silme = kendi notu veya admin. Çalışan `notlar.tsx` sekmesinden yazar/görür; admin hem `hareketler.tsx` akışında hem kendi `notlar.tsx` sekmesinde görür (admin not yazmaz, silebilir).
- `shift_sheets`: nöbet çizelgesinin 2. sayfası, anahtar `shift_id`. Hortum listesi henüz kesinleşmediği için `meters`/`extras` jsonb'dir; alanlar `src/lib/pompa.ts` ve `ShiftSheet` tipinde. 1. sayfa ayrı tablo tutmaz: DVR/ADET/BAK nöbet penceresindeki `stock_movements`'tan hesaplanır; Sütunlar kağıttaki gibi: ÇKN (nöbet penceresindeki `cikis` + `alim`), DVR = nöbet başı stok + ÇKN, SATIŞ (bu nöbetin net satışı), BAK = raftaki stok (ertesi nöbetin başlangıcı). SATIŞ hücresi artarsa `satis`, azalırsa `iade`; ÇKN hücresi sadece artar (`cikis`, depodaki miktarla sınırlı), azaltma admin düzeltmesiyle yapılır. Herkes okur (sonraki nöbetçi önceki sayaç okumasını görür), yazma = vardiya sahibi veya admin. Her kayıtta `log_shift_sheet_change()` tetikleyicisi eski/yeni belgeyi hücre hücre karşılaştırıp (`jsonb_leaves`) değişen her hücreyi `shift_sheet_changes`'e yazar (kişi `auth.uid()`); admin bunu `(admin)/pompa` ekranında görür.
- `hareketler.tsx` (admin) tek birleşik akıştır: hareket + not + bildirim; filtre yokken vardiya bazlı gruplanır (açık vardiya üstte), filtre (tür/kişi/zaman/arama) varken düz liste olur.
- Vardiya kapatılınca (UPDATE ile `ended_at` dolunca) `notify_shift_closed()` tetikleyicisi admin `notifications` tablosuna kayıt atar; sayım farkları `shift_counts` ile `counted_qty <> expected_qty` karşılaştırmasından üretilir.
- Şema değişikliği gerektiğinde: `npm run db:new -- <ad>` ile `supabase/migrations/` altına yeni geçiş açılır; uygulanmış geçiş dosyası **asla düzenlenmez**, düzeltme de yeni geçiştir. SQL Editor'de elle çalıştırma yapılmaz: `npm run db:push` ya da `master`a push'ta `deploy.yml`'deki `migrate` işi (secret: `SUPABASE_DB_URL`, session pooler adresi) uygular; web yayını geçişten sonra başlar. Geçişler yine **idempotent** yazılır (`if not exists` / `drop ... if exists`). Tam şemanın tek dosyalık dökümü gerekirse `npx supabase db dump --linked -f schema.sql` (repoya eklenmez).
- Alan tipleri `src/lib/types.ts` ile şema birebir eşleşmelidir; şema değişirse bu dosya da güncellenir.

## Güvenlik

- Tüm tablolarda **RLS açıktır**. Yetki kontrolü `public.is_admin()` (security definer) fonksiyonuyla yapılır. Özet: ürün yazma = sadece admin; hareket yazma = kendi adına + `satis`/`iade`/`cikis` herkes / `alim`/`depo_alim`/`duzeltme` sadece admin; bildirim okuma/okundu = sadece admin; not okuma/yazma = herkes (kendi adına), not silme = kendi notu veya admin.
- `notifications` ve `shift_sheet_changes` tablolarında **INSERT politikası bilinçli olarak yoktur**; kayıtları yalnızca security definer tetikleyici yazar. Yeni politika eklerken bunu bozmayın. `shift_sheet_changes`'i sadece admin okur.
- `EXPO_PUBLIC_*` anon anahtarı herkese açıktır (Expo'nun doğası gereği); gerçek güvenlik RLS'tedir. Anahtar/URL `.env`'de tutulur, CI'da GitHub Secrets ile verilir.
- Supabase Auth'ta **"Confirm email" kapalı olmalıdır** (çalışan hesapları sahte e-posta kullanır, onay maili gidemez).
- `admin_delete_employee` RPC çalışanı kalıcı siler; kendi hesabını silmeyi engeller.

## Test ve dağıtım

- **Test yok**: Değişiklikleri `npm run lint` ve `npm start` / `npm run web` ile elle doğrulayın.
- **Web dağıtımı**: `.github/workflows/deploy.yml` — `master`a push'ta önce `migrate` işi (`supabase db push`, secret: `SUPABASE_DB_URL`), sonra `npm ci` → `expo export --platform web` (secret'lar: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) → SPA fallback (`404.html` kopyası) + `.nojekyll` → GitHub Pages. Yerel deneme: `npm run deploy`.
- **Android APK**: `npx eas build -p android --profile preview` (EAS CLI + Expo hesabı gerekir; `eas.json`'da `distribution: internal`, `buildType: apk`).
- CI ortamı Node 20 kullanır.

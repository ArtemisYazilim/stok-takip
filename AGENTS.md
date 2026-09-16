# Stok Takip — AI Kod Asistanı Rehberi

Bu dosya projeye yeni katılan bir yapay zekâ kod asistanına gerekli tüm bağlamı verir. Tüm arayüz metinleri, kod yorumları ve dokümantasyon **Türkçe**'dir; bu dosya da Türkçe tutulur.

## Expo SDK 57 uyarısı

Expo **SDK 57** kullanılır (React Native 0.86, React 19). Bu sürüm eğitim verilerinde bulunmayabilir; kod yazmadan önce sürüme özel dokümanı okuyun: https://docs.expo.dev/versions/v57.0.0/

## Proje genel bakış

İşletme yan satış ürünleri (motor yağı, antifriz vb.) için **stok ve vardiya takip** uygulaması. Backend olarak **Supabase** (PostgreSQL + Auth + Storage + Realtime) kullanılır; ayrıca bir sunucu kodu yoktur, tüm iş mantığı veritabanı tetikleyicileri ve RLS politikalarında yaşar.

İki kullanıcı rolü vardır (`src/lib/types.ts`):

- **admin**: Ürün CRUD + fotoğraf, alım/düzeltme/iade girişi, çalışan hesabı açma/silme, çalışana vardiya açma izni verme, herkes adına vardiya açma/kapatma, hareket geçmişi (birleşik filtreli akış), vardiya raporları ve canlı bildirimleri görür.
- **calisan**: Kullanıcı adıyla giriş yapar, vardiya başlatır (profilde `can_open_shift` izni varsa; yoksa admin onun için açar), satış ve iade yapar (stok otomatik güncellenir), ortak not defterine tarihli not düşer, vardiya sonunda raf sayımı yapıp devreder. Sayım farkı admin paneline düşer.

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
```

Ortam değişkenleri (`.env.example`'dan kopyalanır, `.env` gitignore'dadır):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Bu iki değer yoksa uygulama `src/app/_layout.tsx` içinde kurulum ekranı gösterir. Ayrıntılı kurulum: **KURULUM.md** (Supabase projesi açma, `schema.sql` çalıştırma, admin hesabı oluşturma adımları).

**Test altyapısı yoktur** — jest/vitest kurulu değildir ve repoda test dosyası yoktur. Doğrulama `npm run lint` ve manuel çalıştırmayla yapılır.

## Proje yapısı

```
src/
  app/                  # expo-router rotaları (src/app otomatik algılanır)
    _layout.tsx         # Kök: AuthProvider + Stack; .env kontrolü
    index.tsx           # Role göre yönlendirme (admin → (admin)/stok, calisan → (calisan)/satis)
    login.tsx           # Kullanıcı adı/e-posta + şifre girişi
    (admin)/            # Admin sekmeleri: stok, hareketler, vardiyalar, bildirimler, calisanlar, notlar
                        # + href:null detay ekranları: urun, vardiya-detay, calisan-detay
    (calisan)/          # Çalışan sekmeleri: satis (+ iade modu), vardiya, stok, notlar
  components/ui.tsx     # Tek dosyalık UI kiti: colors, Screen, Card, Button, Input,
                        # Badge, EmptyState, SectionTitle, ProductThumb
  hooks/                # use-open-shift (açık vardiya), use-unread-notifications (realtime rozet)
  lib/
    alerts.ts           # Web uyumlu uyarı/onay diyalogları (showAlert/confirmAction)
    supabase.ts         # supabase istemcisi, isSupabaseConfigured, createTempAuthClient,
                        # toLoginEmail (kullanıcı adı → ad@personel.local)
    types.ts            # Alan adı tipleri (Profile, Product, Shift, StockMovement, ...)
                        # ve MOVEMENT_LABELS gibi Türkçe etiketler
    format.ts           # tr-TR para/adet/tarih/süre biçimleme + parseNumberInput ("12,5" → 12.5)
    feedback.ts         # Merkezi ses + titreşim geri bildirimi (feedback.sale/success/error/...)
    storage.ts          # Ürün fotoğrafını Supabase Storage'a yükleme
  providers/
    auth-provider.tsx   # AuthProvider + useAuth (session, profile, signOut, refreshProfile)
supabase/
  schema.sql            # Tam şema: tablolar, tetikleyiciler, RLS, storage bucket, realtime
  002_gelistirmeler.sql # İdempotent geçiş: ürün fotoğrafı + bildirimler (mevcut DB'ye eklenti)
  003_urun_silme.sql    # İdempotent geçiş: admin_delete_product RPC
  004_notlar_ve_vardiya_izni.sql # İdempotent geçiş: notes tablosu + can_open_shift + iade RLS'i
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

- **Stok asla doğrudan `products` üzerinden güncellenmez.** Tüm stok değişimleri `stock_movements` satırı eklenerek yapılır; `apply_stock_movement()` tetikleyicisi stoku atomik günceller ve eksiye düşerse `'Yetersiz stok'` hatasıyla işlemi geri alır. `satis` → `delta = -qty`, `alim`/`iade` → `+qty`, `duzeltme` → istemciden gelen delta.
- **İstemci her zaman tipi Türkçe sabitlerle gönderir**: `'satis'`, `'alim'`, `'duzeltme'`, `'iade'` (bkz. `MovementType`).
- `shifts`: bir çalışanın aynı anda tek açık vardiyası olabilir (kısmi unique index). Vardiya açma: admin herkes adına açabilir/kapatabilir (`vardiyalar.tsx`); çalışan ancak `profiles.can_open_shift` true ise kendi vardiyasını açar (RLS `shifts_insert` politikasında zorlanır).
- `notes`: çalışanların ortak not defteri (kağıt defterin yerini alır). Herkes okur, herkes kendi adına yazar; silme = kendi notu veya admin. Çalışan `notlar.tsx` sekmesinden yazar/görür; admin hem `hareketler.tsx` akışında hem kendi `notlar.tsx` sekmesinde görür (admin not yazmaz, silebilir).
- `hareketler.tsx` (admin) tek birleşik akıştır: hareket + not + bildirim; filtre yokken vardiya bazlı gruplanır (açık vardiya üstte), filtre (tür/kişi/zaman/arama) varken düz liste olur.
- Vardiya kapatılınca (UPDATE ile `ended_at` dolunca) `notify_shift_closed()` tetikleyicisi admin `notifications` tablosuna kayıt atar; sayım farkları `shift_counts` ile `counted_qty <> expected_qty` karşılaştırmasından üretilir.
- Şema değişikliği gerektiğinde: `schema.sql` ilk kurulum içindir; mevcut veritabanlarına ekleme için `002_gelistirmeler.sql` gibi **idempotent** (`if not exists` / `drop ... if exists`) yeni numaralı dosyalar eklenir.
- Alan tipleri `src/lib/types.ts` ile şema birebir eşleşmelidir; şema değişirse bu dosya da güncellenir.

## Güvenlik

- Tüm tablolarda **RLS açıktır**. Yetki kontrolü `public.is_admin()` (security definer) fonksiyonuyla yapılır. Özet: ürün yazma = sadece admin; hareket yazma = kendi adına + `satis`/`iade` herkes / `alim`/`duzeltme` sadece admin; bildirim okuma/okundu = sadece admin; not okuma/yazma = herkes (kendi adına), not silme = kendi notu veya admin.
- `notifications` tablosunda **INSERT politikası bilinçli olarak yoktur**; kayıtları yalnızca security definer tetikleyici yazar. Yeni politika eklerken bunu bozmayın.
- `EXPO_PUBLIC_*` anon anahtarı herkese açıktır (Expo'nun doğası gereği); gerçek güvenlik RLS'tedir. Anahtar/URL `.env`'de tutulur, CI'da GitHub Secrets ile verilir.
- Supabase Auth'ta **"Confirm email" kapalı olmalıdır** (çalışan hesapları sahte e-posta kullanır, onay maili gidemez).
- `admin_delete_employee` RPC çalışanı kalıcı siler; kendi hesabını silmeyi engeller.

## Test ve dağıtım

- **Test yok**: Değişiklikleri `npm run lint` ve `npm start` / `npm run web` ile elle doğrulayın.
- **Web dağıtımı**: `.github/workflows/deploy.yml` — `master`a push'ta `npm ci` → `expo export --platform web` (secret'lar: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) → SPA fallback (`404.html` kopyası) + `.nojekyll` → GitHub Pages. Yerel deneme: `npm run deploy`.
- **Android APK**: `npx eas build -p android --profile preview` (EAS CLI + Expo hesabı gerekir; `eas.json`'da `distribution: internal`, `buildType: apk`).
- CI ortamı Node 20 kullanır.
